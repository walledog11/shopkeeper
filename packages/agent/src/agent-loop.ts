import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "./ai/anthropic.js";
import logger from "./logger.js";
import { resolveModelTuning } from "./model-tuning.js";
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
const TERMINAL_TOOL_NAMES = new Set([
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
  // Shared across attempts when callers reuse usageTotals.
  tokenBudget?: number;
  signal?: AbortSignal;
  beforeModelCall?: () => Promise<void>;
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
  // Planning-only control tools can end a narrowed attempt without becoming an
  // executable plan. The planner consumes the signal and retries from a clean
  // transcript with a wider registry.
  captureStopToolNames?: readonly string[];
  // capture: resolve a discovery control call into extra schemas for the rest of
  // this turn. Unlike the namespace-miss stop above, the attempt continues:
  // observations, transcript and budget are kept and the next model call carries
  // the discovered tools. Discovery performs no effect, so it is never recorded
  // as a plan step.
  captureDiscovery?: {
    toolName: string;
    resolve: (
      rawInput: unknown,
      activeToolNames: ReadonlySet<string>,
    ) => { tools: Anthropic.Tool[]; content: string };
  };
  // capture: consulted when the model proposes send_reply, with the plan as it
  // would stand. A returned message refuses the reply — it is neither recorded
  // nor terminal, and the message goes back as its tool error so the model can
  // take another route. Refuses once per attempt; a repeat is recorded and left
  // to routing.
  captureRefuseReply?: (proposal: {
    rawToolCalls: readonly RawToolCall[];
    readBlocks: readonly Anthropic.ToolUseBlock[];
    readStatus: ReadonlyMap<string, ToolStatus>;
  }) => string | null;
}

// Executes reads for real (preserving the structured ToolStatus that plan
// signals + routing depend on) and records every emitted tool call as a plan
// step. Returns whether a terminal tool was proposed this iteration, and any
// schemas discovery added for the calls that follow.
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
    captureStopToolNames?: readonly string[];
    captureDiscovery?: RunAgentLoopParams["captureDiscovery"];
    captureRefuseReply?: RunAgentLoopParams["captureRefuseReply"];
    replyRefused: boolean;
    activeToolNames: ReadonlySet<string>;
  },
): Promise<{ terminalReached: boolean; discoveredTools: Anthropic.Tool[]; replyRefused: boolean }> {
  const discoveryToolName = state.captureDiscovery?.toolName;
  const discoveryBlocks = discoveryToolName
    ? blocks.filter((b) => b.name === discoveryToolName)
    : [];
  // Discovery is a loop control, not a proposal: it stays out of the plan steps,
  // the read executor and the terminal check below.
  const planBlocks = discoveryToolName
    ? blocks.filter((b) => b.name !== discoveryToolName)
    : blocks;

  const discoveredTools: Anthropic.Tool[] = [];
  const discoveryContent = new Map<string, string>();
  const offered = new Set(state.activeToolNames);
  for (const block of discoveryBlocks) {
    const resolved = state.captureDiscovery!.resolve(block.input, offered);
    discoveryContent.set(block.id, resolved.content);
    for (const tool of resolved.tools) {
      if (offered.has(tool.name)) continue;
      offered.add(tool.name);
      discoveredTools.push(tool);
    }
  }

  const reads = planBlocks.filter((b) => TOOL_CATEGORIES[b.name] === "read");
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

  const refusals = new Map<string, string>();
  if (state.captureRefuseReply && !state.replyRefused && planBlocks.some((b) => b.name === "send_reply")) {
    const refusal = state.captureRefuseReply({
      rawToolCalls: [
        ...state.rawToolCalls,
        ...planBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })),
      ],
      readBlocks: state.readBlocks,
      readStatus: state.readStatus,
    });
    if (refusal) {
      for (const b of planBlocks) if (b.name === "send_reply") refusals.set(b.id, refusal);
    }
  }
  const proposedBlocks = planBlocks.filter((b) => !refusals.has(b.id));

  for (const b of proposedBlocks) {
    state.rawToolCalls.push({ id: b.id, name: b.name, input: b.input });
  }

  const terminalReached = proposedBlocks.some((b) => (
    TERMINAL_TOOL_NAMES.has(b.name)
    || state.captureStopToolNames?.includes(b.name)
  ));

  // Only feed results back when the loop will continue; a terminal ends the turn.
  if (!terminalReached) {
    const toolResults: Anthropic.ToolResultBlockParam[] = blocks.map((b) => {
      const refusal = refusals.get(b.id);
      if (refusal) return { type: "tool_result", tool_use_id: b.id, content: refusal, is_error: true };
      return {
        type: "tool_result",
        tool_use_id: b.id,
        content: discoveryContent.get(b.id)
          ?? (TOOL_CATEGORIES[b.name] === "read"
            ? (state.readResults.get(b.id) ?? CAPTURE_NOT_EXECUTED)
            : CAPTURE_NOT_EXECUTED),
      };
    });
    state.messages.push({ role: "user", content: toolResults });
  }

  return { terminalReached, discoveredTools, replyRefused: state.replyRefused || refusals.size > 0 };
}

export async function runAgentLoop(params: RunAgentLoopParams): Promise<AgentLoopResult> {
  const { ctx, mode, messages, systemPromptBlocks, model, maxIterations, maxTokensPerCall, tokenBudget } = params;
  // The only thing that changes this mid-turn is a resolved discovery call, so
  // every other mode sends the caller's set on every iteration.
  let tools = params.tools;
  const usageTotals = params.usageTotals ?? createModelUsageMetrics();
  const rawToolCalls: RawToolCall[] = [];
  const readBlocks: Anthropic.ToolUseBlock[] = [];
  const readResults = new Map<string, string>();
  const readStatus = new Map<string, ToolStatus>();
  let reprompted = false;
  let replyRefused = false;

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
    ctx.assertExecutionAllowed?.();
    if (tokenBudget !== undefined && usageTotals.budgetTokens >= tokenBudget) return done("token_budget", null, i);
    params.signal?.throwIfAborted();
    await params.beforeModelCall?.();
    await ctx.taskBudget?.reserveModelCall();

    logger.info(
      { iteration: i, messageCount: messages.length, readOnly: mode === "read_only" },
      "[agent] iteration start",
    );

    // Explicit rather than inherited: see model-tuning.ts. Resolved per call
    // because it depends on the model (Haiku rejects effort) and on the mode
    // (thinking is only tuned for planning).
    const tuning = resolveModelTuning(model, mode);
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokensPerCall,
      system: systemPromptBlocks,
      messages,
      tools,
      // Cache the transcript too, not just the system blocks. `messages` grows by
      // an assistant turn plus its tool results every iteration and was re-sent
      // uncached each time, so one substantial tool result cost its full price
      // once per remaining iteration — a 7KB knowledge-base article on a four-call
      // operator turn spent ~5.5k tokens re-reading itself and pushed the turn
      // past TOKEN_BUDGET at call four. Top-level cache_control auto-places on the
      // last cacheable block, which keeps this to one moving breakpoint (three
      // total with the two system blocks, under the four-per-request cap) and
      // leaves the earlier ones readable, so each call writes only its own delta.
      // Nothing the model sees changes.
      cache_control: { type: "ephemeral" },
      ...tuning,
    }, params.signal ? { signal: params.signal } : undefined);

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const usage = recordModelUsage(usageTotals, response);
    await recordSpend(ctx.orgId, usage, model);
    await ctx.taskBudget?.recordModelUsage(usage, model);
    logger.info(
      {
        iteration: i,
        model,
        mode,
        // What was actually sent, not what the env intends. These are env-driven
        // across two separately-deployed apps, so `null` on Sonnet is the signal
        // that the tuning got dropped — on Haiku it is the expected value.
        effort: tuning.output_config?.effort ?? null,
        thinking: tuning.thinking?.type ?? null,
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

    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      if (mode === "capture" && params.captureReprompt && !reprompted) {
        reprompted = true;
        messages.push({ role: "user", content: CAPTURE_TERMINAL_PROMPT });
        return iterate(i + 1);
      }
      return done("end_turn", finalText, i + 1);
    }

    // Budget stop fires only when the loop would otherwise keep iterating: a turn
    // that finished cleanly returns end_turn above with its finalText even if the
    // budget is exhausted. Weighted so cache traffic doesn't count at full price.
    if (tokenBudget !== undefined && usageTotals.budgetTokens >= tokenBudget) {
      return done("token_budget", finalText, i + 1);
    }

    if (mode === "capture") {
      const captured = await handleCaptureBlocks(toolUseBlocks, {
        ctx: ctx as AgentContext,
        settings: params.settings,
        messages,
        rawToolCalls,
        readBlocks,
        readResults,
        readStatus,
        captureStopToolNames: params.captureStopToolNames,
        captureDiscovery: params.captureDiscovery,
        captureRefuseReply: params.captureRefuseReply,
        replyRefused,
        activeToolNames: new Set(tools.map((tool) => tool.name)),
      });
      replyRefused = captured.replyRefused;
      if (captured.discoveredTools.length > 0) tools = [...tools, ...captured.discoveredTools];
      if (captured.terminalReached) return done("terminal_captured", finalText, i + 1);
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
