import { buildCachedSystemPrompt, buildSplitCachedSystemPrompt } from "./ai/anthropic.js";
import { pickModel } from "./ai/index.js";
import type { OrgSettings, RawToolCall } from "./types.js";
import { selectAgentTools } from "./tools/registry/index.js";
import { buildSystemPromptParts, buildComposerAskPrompt } from "./prompt.js";
import { isOperatorChannel } from "./intent.js";
import { buildMessageHistory } from "./message-history.js";
import { runAgentLoop } from "./agent-loop.js";
import type { ActionEntry, BaseAgentContext, AgentResult } from "./agent-context.js";
import type { PersistedAgentAction } from "./agent-actions.js";
import { createModelUsageMetrics, hashInstructionForLog } from "./usage.js";
import { enforceSpendCap } from "./spend.js";
import {
  READ_TOOL_NAMES,
  TOKEN_BUDGET,
  resolveRunPolicy,
  type RunAgentPolicyOptions,
} from "./run-policy.js";
import {
  approvedActionsCompleteOutcome,
  selectExecutableApprovedToolCalls,
  summarizeApprovedDashboardActions,
} from "./run-approved-actions.js";
import {
  createAgentFailureRecorder,
  executeAgentToolCalls,
  finishAgentRun,
  isSupportContext,
  type RecordToolFailure,
} from "./run-execution.js";

export interface RunAgentOptions extends RunAgentPolicyOptions {
  // Injected tool-failure recorder. The dashboard wires this to its ops-alert
  // counter; a thread-less / gateway host may omit it. Keeping it injected is
  // what keeps alerting infra (env, ops-alerts) out of the shared core.
  recordToolFailure?: RecordToolFailure;
  // Pre-generated turn id so the caller can embed it in the agent-turn note
  // and join AgentAction rows back to the note when rendering inline.
  turnId?: string;
  onActionsPersisted?: (actions: PersistedAgentAction[]) => void;
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
  const {
    approval,
    effectiveMode,
    maxIterations,
    readOnly,
    settings: s,
  } = resolveRunPolicy(settings, options);
  const recordToolFailure = options?.recordToolFailure;
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
    ...(options?.onActionsPersisted
      ? { onActionsPersisted: options.onActionsPersisted }
      : {}),
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

  if (!readOnly && approvedToolCalls && approvedToolCalls.length > 0) {
    const executableToolCalls = selectExecutableApprovedToolCalls(supportThread, approvedToolCalls);

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
    }, approvedActionsCompleteOutcome(supportThread));
  }

  // The operator channel is now one durable thread per binding, so its history is
  // the merchant's real conversation — widen the window from the legacy 4. Composer
  // read-only stays narrow.
  const history = operatorMode
    ? ctx.recentMessages.slice(-20)
    : readOnly
      ? ctx.recentMessages.slice(-4)
      : ctx.recentMessages;
  const messageInstruction = readOnly
    ? `Private question from the support operator. Do not contact the customer.\n\n${instruction}`
    : instruction;
  const messages = buildMessageHistory(history, messageInstruction, { segregateUntrusted: !operatorMode });
  // runAgent is the support/composer entry: it builds a support-shaped system
  // prompt and tool set. Thread-less modules (order-ops and later) run through the
  // shared loop (runAgentLoop) via their own entrypoint, not here — the executor
  // and loop are thread-optional, so nothing blocks them.
  if (!isSupportContext(ctx)) {
    return finish({ summary: "This agent run requires a support context.", actionsPerformed }, "unsupported_context");
  }
  const tools = readOnly
    ? selectAgentTools(settings, READ_TOOL_NAMES)
    : selectAgentTools(settings);
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

  // Spend cap is a backstop, not a per-call meter — check once before the model
  // loop. The approved-execution path above returns with zero model calls and
  // stays ungated.
  await enforceSpendCap(ctx.orgId, s);

  const loop = await runAgentLoop({
    ctx,
    mode: readOnly ? "read_only" : "execute",
    messages,
    systemPromptBlocks,
    tools,
    model: iterationModel,
    maxIterations,
    maxTokensPerCall: readOnly ? 2048 : 4096,
    settings,
    usageTotals,
    runTools: executeToolCalls,
    getEscalationReason: () => escalationReason,
    ...(readOnly ? {} : { tokenBudget: TOKEN_BUDGET }),
  });

  switch (loop.stop) {
    case "escalated":
      return finish({
        summary: `Escalated to merchant: ${escalationReason}`,
        actionsPerformed,
      }, "escalated");
    case "max_iterations":
      return finish({
        summary: readOnly
          ? "I could not finish answering that. Try asking a narrower question."
          : "Reached maximum steps without completing the task.",
        actionsPerformed,
      }, "max_iterations");
    case "max_tokens":
      return finish({
        summary: readOnly
          ? "The answer was cut off because the request was too large. Try asking a more specific question."
          : "Agent response was cut off - the request may be too complex. Try breaking it into smaller steps.",
        actionsPerformed,
      }, "max_tokens");
    case "token_budget":
      return finish({
        summary: loop.finalText?.trim()
          || "Agent stopped - this request required too many steps. Please try a more specific instruction.",
        actionsPerformed,
      }, "token_budget");
    default:
      return finish({
        summary: readOnly
          ? (loop.finalText?.trim() || "I do not have enough information to answer that.")
          : (loop.finalText ?? "Done."),
        actionsPerformed,
      }, "end_turn");
  }
}
