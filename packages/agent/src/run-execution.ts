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
import type { ReceiptV1 } from "./tools/result.js";
import type { ProposalCommunication } from "./types.js";
import { fillApprovedDraft } from "./reply-placeholders.js";

export type AgentToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export interface AgentActionDispatchHooks {
  authorizeDispatch: () => Promise<void>;
  markSubmitted: () => Promise<void>;
  failBeforeDispatch: (action: ActionEntry) => Promise<void>;
  complete: (action: ActionEntry) => Promise<void>;
}

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

function isCustomerMessage(toolName: string): boolean {
  return toolName === "send_reply" || toolName === "send_email";
}

/**
 * What an approved proposal lets this run say to the customer. Present only when
 * executing a proposal that binds its communication (runtime v2); absent on the
 * legacy path and on model turns, whose replies keep the legacy grounding.
 */
export interface ApprovedMessage {
  communication: ProposalCommunication;
  /** The approved writes the message waits on. It is sent only if all succeeded. */
  writeCallIds: readonly string[];
}

/**
 * The customer message an approved proposal sends, exactly as approved except
 * for its placeholders, or why it is not sent. No completion fact, result text
 * or prose check is consulted: the merchant approved these words, and what
 * makes them true is that every approved write succeeded and every placeholder
 * filled from its receipt.
 */
function prepareApprovedMessage(
  toolCall: AgentToolCall,
  approved: ApprovedMessage,
  actionsPerformed: readonly ActionEntry[],
): { call: AgentToolCall } | { refusal: string } {
  const communication = approved.communication;
  const field = toolCall.name === "send_email" ? "body" : "text";
  const input = toolCall.input && typeof toolCall.input === "object"
    ? toolCall.input as Record<string, unknown>
    : null;
  if (communication.mode !== "exact_draft" || input?.[field] !== communication.draft) {
    return { refusal: `Error: skipped ${toolCall.name} because it is not the message the merchant approved.` };
  }
  const unfinished = approved.writeCallIds.some((id) => (
    actionsPerformed.find((action) => action.toolCallId === id)?.status !== "success"
  ));
  if (unfinished) {
    return { refusal: `Error: skipped ${toolCall.name} because an approved action did not succeed, so the approved message is not true.` };
  }
  const filled = fillApprovedDraft(communication.draft, communication.allowedResultBindings, actionsPerformed);
  if (filled.status === "unfilled") {
    return { refusal: `Error: skipped ${toolCall.name} because its ${filled.placeholder} placeholder has no value from a successful action receipt.` };
  }
  return { call: { ...toolCall, input: { ...input, [field]: filled.text } } };
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
    approvedMessage?: ApprovedMessage;
    beginAction?: (
      call: AgentToolCall,
      operationId: string,
      providerOperationKey?: string,
    ) => Promise<AgentActionDispatchHooks | undefined>;
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
  const approvedMessage = input.approvedMessage && isCustomerMessage(toolCall.name)
    ? prepareApprovedMessage(toolCall, input.approvedMessage, actionsPerformed)
    : null;
  // The legacy runtime's replies keep their bounded compatibility reader over
  // string-only action rows until that path is deleted (Gate E). An approved
  // exact draft never reaches it.
  const legacyReplyFacts = !input.approvedMessage && isCustomerMessage(toolCall.name)
    ? [
      ...(input.completionEvidence ?? []),
      ...executedCompletionFacts(actionsPerformed, ctx, { allowHistoricalResultInference: true }),
    ]
    : null;
  const executableToolCall = approvedMessage && "call" in approvedMessage
    ? approvedMessage.call
    : legacyReplyFacts
      ? renderReplyCompletionClaims(toolCall, legacyReplyFacts, ctx)
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
  let receipt: ReceiptV1 | undefined;
  let threw = false;
  const runtimeOperationId = !readOnly && category !== "read" ? randomUUID() : undefined;
  const providerOperationKey = runtimeOperationId && ctx.shopify
    ? runtimeOperationId
    : undefined;

  ctx.assertExecutionAllowed?.();

  let actionDispatch: AgentActionDispatchHooks | undefined;
  let dispatchAuthorized = false;

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
  } else if (approvedMessage && "refusal" in approvedMessage) {
    result = approvedMessage.refusal;
    status = "error";
    errorDetail = result;
  } else if (
    legacyReplyFacts
    // Validate the exact receipt-bound text that will be dispatched. The model
    // draft may contain a broader phrase (for example "shipping address") that
    // the canonical renderer deliberately replaces with one grounded claim;
    // checking the discarded draft can reject a safe reply for a claim no
    // customer will receive.
    && unsupportedReplyCompletionClaims(executableToolCall, legacyReplyFacts, ctx).length > 0
  ) {
    result = `Error: skipped ${toolCall.name} because its completion claim is not supported by a successful action result.`;
    status = "error";
    errorDetail = result;
  } else {
    actionDispatch = !readOnly && category !== "read"
      ? await input.beginAction?.(executableToolCall, runtimeOperationId!, providerOperationKey)
      : undefined;
    try {
      ctx.assertExecutionAllowed?.();
      await actionDispatch?.authorizeDispatch();
      dispatchAuthorized = actionDispatch !== undefined;
      await actionDispatch?.markSubmitted();
      const executionIdentity = runtimeOperationId && operationScopeId
        ? {
            operationId: runtimeOperationId,
            executionId: operationScopeId,
            ...(ctx.agentRequestId ? { agentRequestId: ctx.agentRequestId } : {}),
            ...(ctx.agentTaskId ? { agentTaskId: ctx.agentTaskId } : {}),
          }
        : undefined;
      const toolContext = {
        ...ctx,
        ...(executionIdentity ? { execution: executionIdentity } : {}),
        ...(providerOperationKey && ctx.shopify
          ? {
            shopify: {
              ...ctx.shopify,
              operationId: providerOperationKey,
              executionId: operationScopeId,
            },
          }
          : {}),
      };
      const executed = await executeToolWithStatus(
        executableToolCall.name,
        executableToolCall.input,
        toolContext,
        settings,
        moduleTools,
      );
      result = executed.result;
      status = executed.status;
      receipt = executed.receipt;
      if (status !== "success") errorDetail = result;
    } catch (err) {
      threw = true;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const possiblySubmitted = dispatchAuthorized;
      result = `${possiblySubmitted ? "Unknown" : "Error"}: tool "${toolCall.name}" threw - ${errorMessage}`;
      status = possiblySubmitted ? "unknown" : "error";
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
    // The escalation is a consequence of the rejection, not a rewrite of the
    // provider outcome. A rejected receipt must persist with policy_block so
    // recovery and the action ledger retain the actual result.
    setEscalationReason(reason);
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
    ...(receipt ? { receipt } : {}),
  };
  actionsPerformed.push(action);
  if (actionDispatch) {
    if (dispatchAuthorized) await actionDispatch.complete(action);
    else await actionDispatch.failBeforeDispatch(action);
  }
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
