import { db } from "@shopkeeper/db";
import type { ActionEntry, AgentResult } from "./agent-context.js";
import { hashPlan } from "./agent-actions.js";
import { allowsAutomaticExecution, decideAutonomy, type AutonomyVerdict } from "./autonomy.js";
import type { ExecuteAgentTurnDeps } from "./turn.js";
import {
  buildAgentPlanCacheRecord,
  commitThreadPlanCacheIfCurrent,
  type AgentPlanCacheRecord,
} from "./plan-cache.js";
import type { PlanFailureReplanContext } from "./plan-cache-shape.js";
import { captureCommittedPlanOutcome } from "./request-outcome.js";
import { requireOrgThread } from "./thread-auth.js";
import type { AgentPlan, OrgSettings, PlanExecutionOutcome, RawToolCall } from "./types.js";
import {
  hasUnknownProviderOutcome,
  isDefinitePlanExecutionFailure,
  planExecutionOutcomeForResult,
} from "./execution-outcome.js";
import type { planAgent } from "./planner.js";

export type PlanAgentFn = typeof planAgent;

/**
 * A committed child plan, and whether it may run on its own authority.
 *
 * `awaiting_approval` is not a failure: the child is cached and the merchant
 * approves it through the normal card path. The parent's committed work is
 * reported either way.
 */
export type FailureReplanAttempt = {
  status: "executable" | "awaiting_approval";
  cache: AgentPlanCacheRecord;
  context: PlanFailureReplanContext;
  childVerdict: AutonomyVerdict;
};

export function collectCommittedActions(actions: readonly ActionEntry[]): ActionEntry[] {
  return actions.filter((action) => (
    action.status === undefined
    || action.status === "success"
    || action.status === "escalated"
  ));
}

export function findDefiniteFailureAction(
  actions: readonly ActionEntry[],
): ActionEntry | null {
  return actions.find((action) => (
    action.status === "error" || action.status === "policy_block"
  )) ?? null;
}

export function committedToolCallIdsForExecution(
  approvedToolCalls: readonly RawToolCall[],
  actions: readonly ActionEntry[],
): string[] {
  const ids: string[] = [];
  for (let index = 0; index < approvedToolCalls.length; index += 1) {
    const call = approvedToolCalls[index]!;
    const action = actions[index];
    if (!action || action.tool !== call.name) break;
    if (action.status === "error" || action.status === "policy_block" || action.status === "unknown") {
      break;
    }
    if (action.status === undefined || action.status === "success" || action.status === "escalated") {
      ids.push(call.id);
    }
  }
  return ids;
}

export function remainingToolCallsAfterFailure(
  approvedToolCalls: readonly RawToolCall[],
  actions: readonly ActionEntry[],
): RawToolCall[] {
  for (let index = 0; index < approvedToolCalls.length; index += 1) {
    const call = approvedToolCalls[index]!;
    const action = actions[index];
    if (!action || action.tool !== call.name) {
      return approvedToolCalls.slice(index);
    }
    if (action.status === "error" || action.status === "policy_block") {
      return approvedToolCalls.slice(index + 1);
    }
    if (action.status === "unknown") {
      return [];
    }
  }
  return [];
}

export function childPlanRepeatsCommittedSteps(
  childPlan: AgentPlan,
  committedToolCallIds: readonly string[],
): boolean {
  const committed = new Set(committedToolCallIds);
  return childPlan.rawToolCalls.some((call) => committed.has(call.id));
}

export function buildFailureReplanPlanningInstruction(input: {
  baseInstruction: string;
  committedActions: readonly Pick<ActionEntry, "tool" | "result">[];
  failureTool: string;
  failureReason: string;
}): string {
  const completedLines = input.committedActions.length > 0
    ? input.committedActions.map((action) => `- ${action.tool}: ${action.result}`).join("\n")
    : "- none";
  return [
    input.baseInstruction,
    "",
    "A previously approved plan partially failed during execution. Do not repeat completed steps.",
    "",
    "Completed steps:",
    completedLines,
    "",
    `The step "${input.failureTool}" failed with: ${input.failureReason}`,
    "",
    "Draft a new plan to finish the remaining work. Do not call tools for steps already completed above.",
  ].join("\n");
}

export function buildFailureReplanContext(input: {
  parentPlanId: string;
  parentPlan: AgentPlan;
  approvedToolCalls: readonly RawToolCall[];
  actions: readonly ActionEntry[];
  failureAction: ActionEntry;
}): PlanFailureReplanContext {
  const committedToolCallIds = committedToolCallIdsForExecution(
    input.approvedToolCalls,
    input.actions,
  );
  return {
    parentPlanId: input.parentPlanId,
    parentPlanHash: hashPlan(input.parentPlan),
    committedToolCallIds,
    committedActions: collectCommittedActions(input.actions).map((action) => ({
      tool: action.tool,
      result: action.result,
    })),
    failureTool: input.failureAction.tool,
    failureReason: input.failureAction.result,
  };
}

export function canAttemptFailureReplan(input: {
  executionOutcome: PlanExecutionOutcome;
  actions: readonly ActionEntry[];
  approvedToolCalls: readonly RawToolCall[];
  failureReplanAllowed: boolean;
  existingFailureReplan?: PlanFailureReplanContext | null;
}): boolean {
  if (!input.failureReplanAllowed) return false;
  if (input.existingFailureReplan) return false;
  if (!isDefinitePlanExecutionFailure(input.executionOutcome)) return false;
  if (hasUnknownProviderOutcome(input.actions)) return false;
  if (!findDefiniteFailureAction(input.actions)) return false;
  return remainingToolCallsAfterFailure(input.approvedToolCalls, input.actions).length > 0;
}

export async function escalateThreadForUnknownPlanExecution(params: {
  orgId: string;
  threadId: string;
  reason: string;
}): Promise<void> {
  await db.thread.updateMany({
    where: {
      id: params.threadId,
      organizationId: params.orgId,
      escalatedAt: null,
    },
    data: {
      escalatedAt: new Date(),
    },
  });
}

export async function attemptFailureReplanAfterExecution(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  instruction: string;
  sourceMessageId: string;
  parentPlanId: string;
  parentPlan: AgentPlan;
  approvedToolCalls: RawToolCall[];
  result: AgentResult;
  allowMutativeAutoExecute?: boolean;
  buildContext: ExecuteAgentTurnDeps["buildContext"];
  planAgent: PlanAgentFn;
}): Promise<FailureReplanAttempt | null> {
  const executionOutcome = planExecutionOutcomeForResult(params.result);
  if (!canAttemptFailureReplan({
    executionOutcome,
    actions: params.result.actionsPerformed,
    approvedToolCalls: params.approvedToolCalls,
    failureReplanAllowed: true,
    existingFailureReplan: null,
  })) {
    return null;
  }

  const failureAction = findDefiniteFailureAction(params.result.actionsPerformed);
  if (!failureAction) return null;

  const failureReplan = buildFailureReplanContext({
    parentPlanId: params.parentPlanId,
    parentPlan: params.parentPlan,
    approvedToolCalls: params.approvedToolCalls,
    actions: params.result.actionsPerformed,
    failureAction,
  });
  const replanInstruction = buildFailureReplanPlanningInstruction({
    baseInstruction: params.instruction,
    committedActions: failureReplan.committedActions,
    failureTool: failureReplan.failureTool,
    failureReason: failureReplan.failureReason,
  });

  const ctx = await params.buildContext(params.threadId, params.orgId);
  const thread = await requireOrgThread(params.threadId, params.orgId);
  const childPlan = await params.planAgent(ctx, replanInstruction, params.settings);
  if (childPlanRepeatsCommittedSteps(childPlan, failureReplan.committedToolCallIds)) {
    return null;
  }

  // The child stands on its own authority. It never inherits the approval the
  // merchant gave the parent, whose tool calls it does not share.
  const childVerdict = decideAutonomy(childPlan, params.settings, {
    filterStatus: thread.filterStatus,
    threadEscalated: Boolean(thread.escalatedAt),
    allowMutativeAutoExecute: params.allowMutativeAutoExecute,
  });

  const cache = {
    ...buildAgentPlanCacheRecord({
      instruction: params.instruction,
      lastCustomerMessageId: params.sourceMessageId,
      settings: params.settings,
      plan: childPlan,
    }),
    failureReplan,
  };

  const committed = await commitThreadPlanCacheIfCurrent({
    orgId: params.orgId,
    threadId: params.threadId,
    sourceMessageId: params.sourceMessageId,
    cache,
  });
  if (!committed || !cache.planId) {
    return null;
  }

  await captureCommittedPlanOutcome({
    orgId: params.orgId,
    thread: {
      id: thread.id,
      customerId: thread.customerId,
      channelType: thread.channelType,
      tag: thread.tag,
      requestDisposition: thread.requestDisposition,
      classifierSignals: thread.classifierSignals,
      filterStatus: thread.filterStatus,
      escalatedAt: thread.escalatedAt,
    },
    sourceMessageId: params.sourceMessageId,
    planId: cache.planId,
    instruction: params.instruction,
    plan: childPlan,
    settings: params.settings,
    allowMutativeAutoExecute: params.allowMutativeAutoExecute,
    namespaceMiss: childPlan.namespaceMiss,
  });

  return {
    status: allowsAutomaticExecution(childVerdict) ? "executable" : "awaiting_approval",
    cache,
    context: failureReplan,
    childVerdict,
  };
}