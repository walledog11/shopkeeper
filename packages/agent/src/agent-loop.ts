import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "./ai/anthropic.js";
import logger from "./logger.js";
import { recordSpend } from "./spend.js";
import {
  createModelUsageMetrics,
  recordModelUsage,
  type ModelUsageMetrics,
} from "./usage.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import { executePlanningReadTools } from "./planner-read-tools.js";
import type { AgentContext, BaseAgentContext } from "./agent-context.js";
import type { OrgSettings, RawToolCall } from "./types.js";
import type { ToolStatus } from "./tools/result.js";

// One agent loop, three tool-execution modes:
//  - execute:   run every tool (runAgent's mutative loop).
//  - read_only: run every tool; the tool set is already filtered to reads.
//  - capture:   reads execute for real; mutative + terminal tools are recorded
//               as plan steps and NOT executed (planAgent's planning loop).
export type ToolExecMode = "execute" | "capture" | "read_only";

// The tools that end a support turn — the customer/operator hears back, or a
// human takes over. In capture mode the loop stops once one is proposed.
export const TERMINAL_TOOL_NAMES = new Set([
  "send_reply",
  "send_email",
  "escalate_to_human",
  "ask_operator",
]);

// What captured (non-executed) tool calls report back to the model so the loop
// can continue to a terminal tool without performing the side effect.
const CAPTURE_NOT_EXECUTED = "Not executed during planning.";

// Re-prompt used once when a capture run stops without a terminal tool. Replaces
// the old regex-triggered reply-draft / replan-retry phases with a structural
// "you still owe a terminal tool" nudge. Model-elective (no forced tool_choice)
// so escalate / ask_operator stay available.
const CAPTURE_TERMINAL_PROMPT =
  "You have not responded to the customer yet. Call send_reply now, or call escalate_to_human / ask_operator if you cannot resolve this. Do not stop without one of these tools.";

export type AgentLoopStop =
  | "end_turn"
  | "terminal_captured"
  | "escalated"
  | "max_iterations"
  | "max_tokens"
  | "token_budget";

export interface AgentLoopResult {
  stop: AgentLoopStop;
  // Last text block emitted by the model, used by runAgent for its summary.
  finalText: string | null;
  usageTotals: ModelUsageMetrics;
  // Number of model calls made.
  iterations: number;
  // Capture-mode outputs (empty for execute / read_only).
  rawToolCalls: RawToolCall[];
  readBlocks: Anthropic.ToolUseBlock[];
  readResults: Map<string, string>;
  readStatus: Map<string, ToolStatus>;
  reprompted: boolean;
}

export interface RunAgentLoopParams {
  ctx: BaseAgentContext;
  mode: ToolExecMode;
  // Mutated in place as the loop appends assistant / tool-result turns.
  messages: Anthropic.MessageParam[];
  systemPromptBlocks: Anthropic.Messages.MessageCreateParams["system"];
  tools: Anthropic.Tool[];
  model: string;
  maxIterations: number;
  maxTokensPerCall: number;
  // execute mode passes TOKEN_BUDGET; capture / read_only leave it undefined and
  // rely on the iteration cap.
  tokenBudget?: number;
  settings?: OrgSettings;
  // Shared usage accumulator so the caller's run-complete log sees the totals.
  usageTotals?: ModelUsageMetrics;
  // execute / read_only: run one iteration's tool calls and return the
  // tool_result blocks to feed back. Records actions + escalation via closure.
  runTools?: (
    toolCalls: { id: string; name: string; input: unknown }[],
  ) => Promise<Anthropic.ToolResultBlockParam[]>;
  // execute: the escalation reason set by runTools; the loop stops when non-null.
  getEscalationReason?: () => string | null;
  // capture: whether to re-prompt once for a terminal tool on a stalled turn.
  // Support planning sets this; operator planning does not (no customer to
  // reply to).
  captureReprompt?: boolean;
}

// Executes reads for real (preserving the structured ToolStatus that plan
// warnings + routing depend on) and records every emitted tool call as a plan
// step. Returns whether a terminal tool was proposed this iteration.
async function handleCaptureBlocks(
  blocks: Anthropic.ToolUseBlock[],
  state: {
    ctx: AgentContext;
    settings?: OrgSettings;
    messages: Anthropic.MessageParam[];
    rawToolCalls: RawToolCall[];
    readBlocks: Anthropic.ToolUseBlock[];
    readResults: Map<string, string>;
    readStatus: Map<string, ToolStatus>;
  },
): Promise<boolean> {
  const reads = blocks.filter((b) => TOOL_CATEGORIES[b.name] === "read");
  if (reads.length > 0) {
    const executed = await executePlanningReadTools({
      ctx: state.ctx,
      settings: state.settings,
      readBlocks: reads,
    });
    for (const b of reads) state.readBlocks.push(b);
    for (const [id, content] of executed.readResultsMap) state.readResults.set(id, content);
    for (const [id, status] of executed.readStatusMap) state.readStatus.set(id, status);
  }

  for (const b of blocks) {
    state.rawToolCalls.push({ id: b.id, name: b.name, input: b.input });
  }

  const terminalReached = blocks.some((b) => TERMINAL_TOOL_NAMES.has(b.name));

  // Only feed results back when the loop will continue; a terminal ends the turn.
  if (!terminalReached) {
    const toolResults: Anthropic.ToolResultBlockParam[] = blocks.map((b) => ({
      type: "tool_result",
      tool_use_id: b.id,
      content: TOOL_CATEGORIES[b.name] === "read"
        ? (state.readResults.get(b.id) ?? CAPTURE_NOT_EXECUTED)
        : CAPTURE_NOT_EXECUTED,
    }));
    state.messages.push({ role: "user", content: toolResults });
  }

  return terminalReached;
}

export async function runAgentLoop(params: RunAgentLoopParams): Promise<AgentLoopResult> {
  const { ctx, mode, messages, systemPromptBlocks, tools, model, maxIterations, maxTokensPerCall, tokenBudget } = params;
  const usageTotals = params.usageTotals ?? createModelUsageMetrics();
  const rawToolCalls: RawToolCall[] = [];
  const readBlocks: Anthropic.ToolUseBlock[] = [];
  const readResults = new Map<string, string>();
  const readStatus = new Map<string, ToolStatus>();
  let reprompted = false;

  const done = (stop: AgentLoopStop, finalText: string | null, iterations: number): AgentLoopResult => ({
    stop,
    finalText,
    usageTotals,
    iterations,
    rawToolCalls,
    readBlocks,
    readResults,
    readStatus,
    reprompted,
  });

  const iterate = async (i: number): Promise<AgentLoopResult> => {
    if (i >= maxIterations) return done("max_iterations", null, i);

    logger.info(
      { iteration: i, messageCount: messages.length, readOnly: mode === "read_only" },
      "[agent] iteration start",
    );

    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokensPerCall,
      system: systemPromptBlocks,
      messages,
      tools,
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const usage = recordModelUsage(usageTotals, response);
    await recordSpend(ctx.orgId, usage, model);
    logger.info(
      {
        iteration: i,
        model,
        mode,
        stopReason: response.stop_reason,
        tools: toolUseBlocks.map((b) => b.name),
        usage,
        totalTokens: usageTotals.totalTokens,
      },
      "[agent] iteration end",
    );

    messages.push({ role: "assistant", content: response.content });

    let finalText: string | null = null;
    for (const block of response.content) {
      if (block.type === "text") {
        finalText = block.text;
        break;
      }
    }

    if (response.stop_reason === "max_tokens") return done("max_tokens", finalText, i + 1);
    if (tokenBudget !== undefined && usageTotals.totalTokens >= tokenBudget) {
      return done("token_budget", finalText, i + 1);
    }

    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      if (mode === "capture" && params.captureReprompt && !reprompted) {
        reprompted = true;
        messages.push({ role: "user", content: CAPTURE_TERMINAL_PROMPT });
        return iterate(i + 1);
      }
      return done("end_turn", finalText, i + 1);
    }

    if (mode === "capture") {
      const terminalReached = await handleCaptureBlocks(toolUseBlocks, {
        ctx: ctx as AgentContext,
        settings: params.settings,
        messages,
        rawToolCalls,
        readBlocks,
        readResults,
        readStatus,
      });
      if (terminalReached) return done("terminal_captured", finalText, i + 1);
      return iterate(i + 1);
    }

    const toolResults = await params.runTools!(
      toolUseBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })),
    );
    messages.push({ role: "user", content: toolResults });

    if (params.getEscalationReason?.()) return done("escalated", finalText, i + 1);
    return iterate(i + 1);
  };

  return iterate(0);
}
