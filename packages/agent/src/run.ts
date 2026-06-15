import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, buildCachedSystemPrompt, buildSplitCachedSystemPrompt } from "./ai/anthropic.js";
import { pickModel } from "./ai/index.js";
import logger from "./logger.js";
import type { OrgSettings, RawToolCall } from "./types.js";
import { resolveAgentSettings } from "./settings.js";
import { TOOL_CATEGORIES, selectAgentTools } from "./tools/registry/index.js";
import { buildSystemPromptParts, buildComposerAskPrompt } from "./prompt.js";
import { selectToolNamesForInstruction, isOperatorChannel } from "./intent.js";
import { buildMessageHistory } from "./message-history.js";
import { summarizeApprovedDashboardActions, tryRunOperatorOrderStatusFastPath } from "./order-status-fast-path.js";
import type { ActionEntry, AgentActionMode, BaseAgentContext, AgentResult } from "./agent-context.js";
import { createModelUsageMetrics, hashInstructionForLog, recordModelUsage } from "./usage.js";
import { enforceSpendCap, recordSpend } from "./spend.js";
import type { AgentActionApproval } from "./agent-actions.js";
import {
  createAgentFailureRecorder,
  executeAgentToolCalls,
  finishAgentRun,
  isSupportContext,
  type RecordToolFailure,
} from "./run-execution.js";

const DEFAULT_MAX_ITERATIONS = 10;
const READ_ONLY_MAX_ITERATIONS = 4;
const TOKEN_BUDGET = 20_000;

const READ_TOOL_NAMES = Object.entries(TOOL_CATEGORIES).flatMap(([name, category]) => (
  category === "read" ? [name] : []
));

export interface RunAgentOptions {
  readOnly?: boolean;
  // Injected tool-failure recorder. The dashboard wires this to its ops-alert
  // counter; a thread-less / gateway host may omit it. Keeping it injected is
  // what keeps alerting infra (env, ops-alerts) out of the shared core.
  recordToolFailure?: RecordToolFailure;
  mode?: AgentActionMode;
  approval?: AgentActionApproval;
  // Pre-generated turn id so the caller can embed it in the agent-turn note
  // and join AgentAction rows back to the note when rendering inline.
  turnId?: string;
}

export async function runAgent(
  ctx: BaseAgentContext,
  instruction: string,
  approvedToolCalls?: RawToolCall[],
  settings?: OrgSettings,
  options?: RunAgentOptions,
): Promise<AgentResult> {
  const startedAt = Date.now();
  const usageTotals = createModelUsageMetrics();
  const executedToolCalls: string[] = [];
  const instructionHash = hashInstructionForLog(instruction);
  const s = resolveAgentSettings(settings);
  const readOnly = options?.readOnly ?? false;
  const recordToolFailure = options?.recordToolFailure;
  const effectiveMode: AgentActionMode = options?.mode ?? (readOnly ? "read_only" : "human_approved");
  const approval = effectiveMode === "human_approved" ? options?.approval : undefined;
  const maxIterations = readOnly
    ? READ_ONLY_MAX_ITERATIONS
    : (s.maxIterations > 0 ? s.maxIterations : DEFAULT_MAX_ITERATIONS);
  const actionsPerformed: ActionEntry[] = [];
  // Thread/customer are present only on a SupportContext; capture them once so the
  // thread-less path (Track 3) logs/audits with nulls instead of dereferencing.
  const supportThread = isSupportContext(ctx) ? ctx.thread : null;
  const supportCustomer = isSupportContext(ctx) ? ctx.customer : null;
  const operatorMode = supportThread != null && isOperatorChannel(supportThread.channelType);
  const failureAlertPromises: Promise<unknown>[] = [];
  let escalationReason: string | null = null;
  const finish = (result: AgentResult, outcome: string) => finishAgentRun({
    ctx,
    result,
    outcome,
    failureAlertPromises,
    supportThread,
    supportCustomer,
    effectiveMode,
    instruction,
    summaryStartedAt: startedAt,
    usageTotals,
    readOnly,
    approvedToolCallCount: approvedToolCalls?.length ?? 0,
    executedToolCalls,
    instructionHash,
    ...(options?.turnId ? { turnId: options.turnId } : {}),
    ...(approval ? { approval } : {}),
  });
  const recordAgentFailureSafely = createAgentFailureRecorder({
    ctx,
    readOnly,
    recordToolFailure,
    supportThread,
    failureAlertPromises,
  });
  const executeToolCalls = (toolCalls: { id: string; name: string; input: unknown }[]) =>
    executeAgentToolCalls(toolCalls, {
      ctx,
      settings,
      readOnly,
      supportThread,
      actionsPerformed,
      executedToolCalls,
      recordAgentFailure: recordAgentFailureSafely,
      setEscalationReason: reason => {
        escalationReason = reason;
      },
    });

  if (!readOnly && !approvedToolCalls?.length && isSupportContext(ctx)) {
    const fastResult = await tryRunOperatorOrderStatusFastPath(ctx, instruction, settings, actionsPerformed);
    if (fastResult) {
      for (const action of fastResult.actionsPerformed) {
        if (action.status === "error") {
          recordAgentFailureSafely("tool_result", action.tool, action.result);
        }
      }
      logger.info({ actionCount: fastResult.actionsPerformed.length }, "[agent] fast order-status result");
      executedToolCalls.push(...fastResult.actionsPerformed.map(action => action.tool));
      return finish(fastResult, "fast_order_status");
    }
  }

  if (!readOnly && approvedToolCalls && approvedToolCalls.length > 0) {
    const executableToolCalls = supportThread?.channelType === "dashboard_agent"
      ? approvedToolCalls.filter((tc) => TOOL_CATEGORIES[tc.name] === "action")
      : approvedToolCalls;

    if (supportThread?.channelType === "dashboard_agent" && executableToolCalls.length === 0) {
      return finish({
        summary: "No approved dashboard action was available to execute.",
        actionsPerformed,
      }, "approved_dashboard_actions_empty");
    }

    await executeToolCalls(executableToolCalls);

    if (escalationReason) {
      return finish({
        summary: `Escalated to merchant: ${escalationReason}`,
        actionsPerformed,
      }, "escalated");
    }

    return finish({
      summary: summarizeApprovedDashboardActions(actionsPerformed),
      actionsPerformed,
    }, supportThread?.channelType === "dashboard_agent" ? "approved_dashboard_actions" : "approved_plan_actions");
  }

  const history = operatorMode || readOnly ? ctx.recentMessages.slice(-4) : ctx.recentMessages;
  const messageInstruction = readOnly
    ? `Private question from the support operator. Do not contact the customer.\n\n${instruction}`
    : instruction;
  const messages = buildMessageHistory(history, messageInstruction, { segregateUntrusted: !operatorMode });
  // The model loop needs a module-supplied system prompt + tool set. Only support
  // (tickets + composer-ask) supplies one today; thread-less module loops are Track 3.
  if (!isSupportContext(ctx)) {
    throw new Error("runAgent: thread-less module loops are not wired until Track 3");
  }
  const tools = readOnly
    ? selectAgentTools(settings, READ_TOOL_NAMES)
    : selectAgentTools(settings, selectToolNamesForInstruction(ctx, instruction));
  let systemPromptBlocks;
  if (readOnly) {
    systemPromptBlocks = buildCachedSystemPrompt(buildComposerAskPrompt(ctx, settings));
  } else {
    const { stable, volatile } = buildSystemPromptParts(ctx, settings);
    systemPromptBlocks = buildSplitCachedSystemPrompt(stable, volatile);
  }
  // The read-only composer-ask loop stays on Haiku; the mutative agent loop
  // (operator + end-to-end runs) is a judgment/mutative path, so it runs on Sonnet.
  const iterationModel = pickModel(readOnly ? "composer_ask" : "agent_run");

  const runModelIteration = async (i: number): Promise<AgentResult> => {
    if (i >= maxIterations) {
      return finish({
        summary: readOnly
          ? "I could not finish answering that. Try asking a narrower question."
          : "Reached maximum steps without completing the task.",
        actionsPerformed,
      }, "max_iterations");
    }

    logger.info({ iteration: i, messageCount: messages.length, readOnly }, "[agent] iteration start");

    await enforceSpendCap(ctx.orgId, s);

    const response = await anthropic.messages.create({
      model: iterationModel,
      max_tokens: readOnly ? 2048 : 4096,
      system: systemPromptBlocks,
      messages,
      tools,
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const usage = recordModelUsage(usageTotals, response);
    await recordSpend(ctx.orgId, usage, iterationModel);
    logger.info({
      iteration: i,
      model: iterationModel,
      stopReason: response.stop_reason,
      tools: toolUseBlocks.map(b => b.name),
      usage,
      totalTokens: usageTotals.totalTokens,
    }, "[agent] iteration end");

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "max_tokens") {
      return finish({
        summary: readOnly
          ? "The answer was cut off because the request was too large. Try asking a more specific question."
          : "Agent response was cut off - the request may be too complex. Try breaking it into smaller steps.",
        actionsPerformed,
      }, "max_tokens");
    }

    if (!readOnly && usageTotals.totalTokens >= TOKEN_BUDGET) {
      return finish({ summary: "Agent stopped - this request required too many steps. Please try a more specific instruction.", actionsPerformed }, "token_budget");
    }

    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      let textBlock: Anthropic.TextBlock | undefined;
      for (const block of response.content) {
        if (block.type === "text") {
          textBlock = block;
          break;
        }
      }
      return finish({
        summary: readOnly
          ? (textBlock?.text?.trim() || "I do not have enough information to answer that.")
          : (textBlock?.text ?? "Done."),
        actionsPerformed,
      }, "end_turn");
    }

    const toolResults = await executeToolCalls(toolUseBlocks);
    messages.push({ role: "user", content: toolResults });

    if (escalationReason) {
      return finish({
        summary: `Escalated to merchant: ${escalationReason}`,
        actionsPerformed,
      }, "escalated");
    }

    return runModelIteration(i + 1);
  };

  return runModelIteration(0);
}
