import { randomUUID } from "node:crypto";
import logger from "./logger.js";
import type { OrgSettings } from "./types.js";
import { TOOL_CATEGORIES, type AgentToolDefinition } from "./tools/registry/index.js";
import { executeToolWithStatus } from "./tools/executor.js";
import type {
  ActionEntry,
  AgentActionMode,
  AgentActionStatus,
  AgentResult,
  BaseAgentContext,
  SupportContext,
} from "./agent-context.js";
import {
  recordAgentActionsBatch,
  summarizeJournaledActions,
  recordAgentTurnUsage,
  type AgentActionApproval,
  type PersistedAgentAction,
} from "./agent-actions.js";
import type { ModelUsageMetrics } from "./usage.js";
import {
  executedCompletionFacts,
  type CompletionFact,
} from "./completion-facts.js";
import {
  renderReplyCompletionClaims,
  unsupportedReplyCompletionClaims,
} from "./plan-grounding.js";

export type AgentToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type RecordToolFailure = (
  kind: "tool_result" | "tool_exception",
  tool: string,
  detail: string,
) => Promise<unknown> | void;

export type RecordAgentFailure = (
  kind: "tool_result" | "tool_exception",
  tool: string,
  detail: string,
) => void;

function inputKeys(input: unknown): string[] {
  return input && typeof input === "object" ? Object.keys(input) : [];
}

function inputChars(input: unknown): number {
  return JSON.stringify(input ?? null).length;
}

function canExecuteBatchInParallel(toolNames: readonly string[]): boolean {
  return toolNames.every((name) => TOOL_CATEGORIES[name] === "read");
}

function shouldSkipAfterFailedReply(toolName: string, actionsPerformed: ActionEntry[]): boolean {
  if (toolName !== "update_thread_status") return false;
  return actionsPerformed.some((action) => (
    action.tool === "send_reply" && action.status === "error"
  ));
}

function hasUnknownProviderOutcome(actionsPerformed: ActionEntry[]): boolean {
  return actionsPerformed.some((action) => action.status === "unknown");
}

// A context carries a support thread iff it has a `thread`. Thread-less modules
// (order-ops, Track 3) supply a BaseAgentContext with no thread/customer.
export function isSupportContext(ctx: BaseAgentContext): ctx is SupportContext {
  return (ctx as Partial<SupportContext>).thread != null;
}

export function createAgentFailureRecorder(input: {
  ctx: BaseAgentContext;
  readOnly: boolean;
  recordToolFailure?: RecordToolFailure;
  supportThread: SupportContext["thread"] | null;
  failureAlertPromises: Promise<unknown>[];
}): RecordAgentFailure {
  const { ctx, readOnly, recordToolFailure, supportThread, failureAlertPromises } = input;
  return (kind, tool, detail) => {
    if (readOnly || !recordToolFailure) {
      return;
    }

    const alertPromise = Promise.resolve(recordToolFailure(kind, tool, detail)).catch((error) => {
      logger.error({
        err: error,
        orgId: ctx.orgId,
        threadId: supportThread?.id ?? null,
        tool,
      }, "[agent] failure alert error");
    });
    failureAlertPromises.push(alertPromise);
  };
}

export async function finishAgentRun(input: {
  ctx: BaseAgentContext;
  result: AgentResult;
  outcome: string;
  failureAlertPromises: Promise<unknown>[];
  supportThread: SupportContext["thread"] | null;
  supportCustomer: SupportContext["customer"] | null;
  effectiveMode: AgentActionMode;
  instruction: string;
  summaryStartedAt: number;
  usageTotals: ModelUsageMetrics;
  readOnly: boolean;
  approvedToolCallCount: number;
  executedToolCalls: string[];
  instructionHash: string;
  turnId?: string;
  approval?: AgentActionApproval;
  executionId?: string;
  onActionsPersisted?: (actions: PersistedAgentAction[]) => void;
  journaledActions?: Set<ActionEntry>;
}): Promise<AgentResult> {
  const {
    ctx,
    result,
    outcome,
    failureAlertPromises,
    supportThread,
    supportCustomer,
    effectiveMode,
    instruction,
    summaryStartedAt,
    usageTotals,
    readOnly,
    approvedToolCallCount,
    executedToolCalls,
    instructionHash,
    turnId,
    approval,
  } = input;

  if (failureAlertPromises.length > 0) {
    await Promise.allSettled(failureAlertPromises);
  }

  // Resolved once so the usage row and the action rows carry the same turn id
  // and can be joined. The batch would otherwise mint its own, and a turn that
  // executes nothing has none at all.
  const resolvedTurnId = turnId ?? randomUUID();
  const durationMs = Date.now() - summaryStartedAt;
  const purpose = readOnly
    ? "composer_ask"
    : supportThread?.channelType === "operator"
      ? "operator_turn"
      : "agent_run";

  const unjournaledActions = result.actionsPerformed.filter(action => !input.journaledActions?.has(action));
  if (unjournaledActions.length > 0) {
    try {
      const persistedActions = await recordAgentActionsBatch({
        orgId: ctx.orgId,
        threadId: supportThread?.id ?? null,
        customerId: supportCustomer?.id ?? null,
        mode: effectiveMode,
        actions: unjournaledActions,
        instruction,
        summary: result.summary,
        turnId: resolvedTurnId,
        ...(approval ? { approval } : {}),
        ...(input.executionId ? { executionId: input.executionId } : {}),
      });
      input.onActionsPersisted?.(persistedActions);
    } catch (err) {
      logger.error({
        err,
        orgId: ctx.orgId,
        threadId: supportThread?.id ?? null,
        actionCount: result.actionsPerformed.length,
      }, "[agent] failed to persist agent action audit rows");
    }
  }

  if (input.journaledActions?.size) {
    try {
      await summarizeJournaledActions(ctx.orgId, resolvedTurnId, result.summary);
    } catch (err) {
      logger.error({ err, orgId: ctx.orgId, turnId: resolvedTurnId }, "[agent] failed to update action summaries");
    }
  }

  // Persisted as well as logged: the log line is the richer record, but it is
  // only readable while the platform is holding it, and a `token_budget` stop is
  // exactly the turn someone wants to read days later.
  try {
    await recordAgentTurnUsage({
      turnId: resolvedTurnId,
      orgId: ctx.orgId,
      threadId: supportThread?.id ?? null,
      purpose,
      channelType: supportThread?.channelType ?? null,
      outcome,
      durationMs,
      usage: usageTotals,
    });
  } catch (err) {
    // Never fatal. This is a metrics row, and the turn's real work is already
    // done -- including in the window where the migration has not landed yet.
    logger.error({
      err,
      orgId: ctx.orgId,
      turnId: resolvedTurnId,
    }, "[agent] failed to persist agent turn usage");
  }

  logger.info({
    orgId: ctx.orgId,
    threadId: supportThread?.id ?? null,
    turnId: resolvedTurnId,
    purpose,
    channelType: supportThread?.channelType ?? null,
    outcome,
    readOnly,
    durationMs,
    modelCalls: usageTotals.modelCalls,
    usageTotals,
    approvedToolCallCount,
    executedToolCallCount: executedToolCalls.length,
    executedToolCalls,
    actionCount: result.actionsPerformed.length,
    summaryChars: result.summary.length,
    instructionHash,
  }, "[agent] run complete");
  return result;
}

export async function executeAgentToolCall(
  toolCall: AgentToolCall,
  input: {
    ctx: BaseAgentContext;
    settings?: OrgSettings;
    readOnly: boolean;
    supportThread: SupportContext["thread"] | null;
    actionsPerformed: ActionEntry[];
    executedToolCalls: string[];
    recordAgentFailure: RecordAgentFailure;
    setEscalationReason: (reason: string) => void;
    // Host-injected module tools (e.g. the operator control tools). Resolved
    // ahead of the shared registry in the executor, so their category is taken
    // from the definition rather than TOOL_CATEGORIES (which knows nothing of
    // them).
    moduleTools?: Record<string, AgentToolDefinition>;
    operationScopeId?: string;
    completionEvidence?: readonly CompletionFact[];
    beginAction?: (call: AgentToolCall, providerOperationKey?: string) => Promise<((action: ActionEntry) => Promise<void>) | undefined>;
  },
) {
  const {
    ctx,
    settings,
    readOnly,
    supportThread,
    actionsPerformed,
    executedToolCalls,
    recordAgentFailure,
    setEscalationReason,
    moduleTools,
    operationScopeId,
  } = input;
  ctx.assertExecutionAllowed?.();
  const category = moduleTools?.[toolCall.name]?.category ?? TOOL_CATEGORIES[toolCall.name];
  const completionFacts = [
    ...(input.completionEvidence ?? []),
    ...executedCompletionFacts(actionsPerformed, ctx),
  ];
  const executableToolCall = toolCall.name === "send_reply" || toolCall.name === "send_email"
    ? renderReplyCompletionClaims(toolCall, completionFacts, ctx)
    : toolCall;

  logger.info({
    orgId: ctx.orgId,
    threadId: supportThread?.id ?? null,
    tool: toolCall.name,
    inputKeys: inputKeys(executableToolCall.input),
    inputChars: inputChars(executableToolCall.input),
  }, "[agent] tool call");

  const startedAt = Date.now();
  let result: string;
  let status: AgentActionStatus;
  let errorDetail: string | undefined;
  let threw = false;
  const providerOperationKey = operationScopeId && ctx.shopify
    ? `${operationScopeId}:${toolCall.id}`
    : undefined;

  const completeAction = !readOnly && category !== "read"
    ? await input.beginAction?.(executableToolCall, providerOperationKey)
    : undefined;
  ctx.assertExecutionAllowed?.();

  if (readOnly && category !== "read") {
    result = `Error: ${toolCall.name} is not available in private ask mode.`;
    status = "error";
    errorDetail = result;
  } else if (hasUnknownProviderOutcome(actionsPerformed)) {
    result = `Unknown: skipped ${toolCall.name} because an earlier action may have committed at its provider.`;
    status = "unknown";
    errorDetail = result;
  } else if (shouldSkipAfterFailedReply(toolCall.name, actionsPerformed)) {
    result = "Error: skipped status update because send_reply failed.";
    status = "error";
    errorDetail = result;
  } else if (
    (toolCall.name === "send_reply" || toolCall.name === "send_email")
    && unsupportedReplyCompletionClaims(toolCall, completionFacts, ctx).length > 0
  ) {
    result = `Error: skipped ${toolCall.name} because its completion claim is not supported by a successful action result.`;
    status = "error";
    errorDetail = result;
  } else {
    try {
      const toolContext = providerOperationKey && ctx.shopify
        ? {
            ...ctx,
            shopify: {
              ...ctx.shopify,
              operationId: providerOperationKey,
            },
          }
        : ctx;
      const executed = await executeToolWithStatus(
        executableToolCall.name,
        executableToolCall.input,
        toolContext,
        settings,
        moduleTools,
      );
      result = executed.result;
      status = executed.status;
      if (status !== "success") errorDetail = result;
    } catch (err) {
      threw = true;
      const errorMessage = err instanceof Error ? err.message : String(err);
      result = `Error: tool "${toolCall.name}" threw - ${errorMessage}`;
      status = "error";
      errorDetail = errorMessage;
      logger.error({ err, tool: toolCall.name }, "[agent] tool error");
      recordAgentFailure("tool_exception", toolCall.name, errorMessage);
    }
  }

  // A hard policy block on a mutative action (over-cap refund, cancellations disabled,
  // daily cap, custom line items) is not something the model should retry or talk its
  // way around. Route it to a human deterministically instead of feeding the error back
  // into the loop - the safe outcome no longer depends on the model choosing to escalate.
  const operatorPolicyBlock = status === "policy_block"
    && supportThread != null
    && supportThread.channelType === "operator";
  if (!threw && status === "policy_block" && category === "action" && !operatorPolicyBlock) {
    const reason = result.replace(/^Error:\s*/, "").trim() || "Action blocked by policy.";
    await ctx.escalate(reason);
    result = reason;
    status = "escalated";
  }

  if (!threw && (status === "error" || status === "unknown")) {
    recordAgentFailure("tool_result", toolCall.name, result);
  }

  if (status === "escalated") {
    setEscalationReason(result.trim() || "No reason provided");
    errorDetail = undefined;
  }

  const durationMs = Date.now() - startedAt;

  logger.info({
    orgId: ctx.orgId,
    threadId: supportThread?.id ?? null,
    tool: toolCall.name,
    resultChars: result.length,
    isError: status === "error" || status === "policy_block" || status === "unknown",
    status,
    durationMs,
  }, "[agent] tool result");
  executedToolCalls.push(toolCall.name);
  const action: ActionEntry = {
    tool: toolCall.name,
    result,
    input: executableToolCall.input,
    toolCallId: toolCall.id,
    ...(providerOperationKey ? { providerOperationKey } : {}),
    durationMs,
    status,
    category,
    ...(errorDetail ? { errorDetail } : {}),
  };
  actionsPerformed.push(action);
  await completeAction?.(action);
  return {
    type: "tool_result" as const,
    tool_use_id: toolCall.id,
    content: result,
  };
}

function shouldStopApprovedExecution(
  status: AgentActionStatus | undefined,
  stopOnDefiniteFailure: boolean | undefined,
): boolean {
  if (status === "escalated") return true;
  if (!stopOnDefiniteFailure) return false;
  return status === "error" || status === "policy_block";
}

export async function executeAgentToolCalls(
  toolCalls: AgentToolCall[],
  input: Parameters<typeof executeAgentToolCall>[1] & {
    stopOnDefiniteFailure?: boolean;
  },
) {
  if (canExecuteBatchInParallel(toolCalls.map((toolCall) => toolCall.name))) {
    return Promise.all(toolCalls.map(toolCall => executeAgentToolCall(toolCall, input)));
  }

  const results: Awaited<ReturnType<typeof executeAgentToolCall>>[] = [];
  for (const toolCall of toolCalls) {
    results.push(await executeAgentToolCall(toolCall, input));
    if (shouldStopApprovedExecution(input.actionsPerformed.at(-1)?.status, input.stopOnDefiniteFailure)) {
      break;
    }
  }
  return results;
}
