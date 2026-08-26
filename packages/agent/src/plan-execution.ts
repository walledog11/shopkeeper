import { Prisma, db, type DbChannelType } from "@shopkeeper/db";
import { isDeepStrictEqual } from "node:util";
import { BadRequestError, ConflictError } from "./errors.js";
import { executeAgentTurn, type ExecuteAgentTurnDeps } from "./turn.js";
import { getLatestConversationMessage, requireOrgThread } from "./thread-auth.js";
import { isAgentPlanCacheHit, readAgentPlanCache } from "./plan-cache.js";
import type { PlanFailureReplanContext } from "./plan-cache-shape.js";
import { getPendingCustomerMessageId } from "./plan-cache-shape.js";
import { hashInstruction, hashPlan, type AgentActionApproval } from "./agent-actions.js";
import { decideAutonomy, type AutonomyVerdict } from "./autonomy.js";
import { shouldBlockTrustedSendActions, shouldSkipAutoPlan } from "./sender-trust.js";
import { resolveAutoExecuteMode } from "./settings.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import {
  isDefinitePlanExecutionFailure,
  isUnknownPlanExecution,
  ledgerStatusForPlanOutcome,
  planExecutionOutcomeForResult,
} from "./execution-outcome.js";
import {
  attemptFailureReplanAfterExecution,
  escalateThreadForUnknownPlanExecution,
  type PlanAgentFn,
} from "./plan-failure-replan.js";
import type { AgentResult } from "./agent-context.js";
import type { AgentPlan, OrgSettings, PlanExecutionOutcome, RawToolCall } from "./types.js";
import {
  claimCurrentPlanExecution,
  completePlanExecution,
  type PlanExecutionIdentity,
} from "./execution-ledger.js";
import { isInvalidPlan } from "./plan-validation.js";
import { recordRequestEpisodeDismissed, recordRequestEpisodeExecution } from "./request-outcome.js";

export type PlanExecutionDeps = ExecuteAgentTurnDeps & {
  planAgent?: PlanAgentFn;
};

export interface ApproverIdentity {
  clerkUserId: string;
  displayName: string | null;
}

export function formatApproverId(identity: ApproverIdentity): string {
  return identity.displayName ? `${identity.clerkUserId}:${identity.displayName}` : identity.clerkUserId;
}

interface CurrentCachedPlan {
  channel: DbChannelType;
  instruction: string;
  lastCustomerMessageId: string | null;
  planId: string | null;
  plan: AgentPlan | null;
  verdict: AutonomyVerdict;
  failureReplan: PlanFailureReplanContext | null;
}

export interface FailureReplanRecovery {
  parentResult: AgentResult;
  parentPlan: AgentPlan;
  context: PlanFailureReplanContext;
}

interface ExecutedCachedPlan extends CurrentCachedPlan {
  plan: AgentPlan;
  approvedToolCalls: RawToolCall[];
  execution: {
    id: string | null;
    status: PlanExecutionOutcome;
  };
  result: AgentResult;
  failureReplanRecovery?: FailureReplanRecovery;
}

export interface ExpectedPlanIdentity {
  planId?: string | null;
  sourceMessageId?: string | null;
  planHash?: string | null;
  instructionHash?: string | null;
}

export type PlanExecutionLedgerMode = "off" | "enforce";
export type ExecutionIntent = "automatic" | "merchant_approved";

export function resolvePlanExecutionLedgerMode(
  value: string | undefined = process.env.PLAN_EXECUTION_LEDGER_MODE,
): PlanExecutionLedgerMode {
  return value === "off" ? "off" : "enforce";
}

const EXECUTABLE_CATEGORIES = new Set(["action", "communication", "internal"]);

export function isAutoExecuteEnabled(settings: OrgSettings): boolean {
  return resolveAutoExecuteMode(settings) === "live";
}

export function getExecutablePlanToolCalls(plan: AgentPlan): RawToolCall[] {
  return plan.rawToolCalls.filter((toolCall) => {
    const category = TOOL_CATEGORIES[toolCall.name];
    return Boolean(category && EXECUTABLE_CATEGORIES.has(category));
  });
}

function validateApprovedToolCalls(plan: AgentPlan, approvedToolCalls: RawToolCall[]): void {
  const approvedIds = new Set(approvedToolCalls.map((toolCall) => toolCall.id));
  if (approvedIds.size !== approvedToolCalls.length) {
    throw new BadRequestError("Approved tool calls cannot contain duplicate plan steps");
  }
  const plannedById = new Map(plan.rawToolCalls.map((toolCall) => [toolCall.id, toolCall]));
  const allMatch = approvedToolCalls.every((approved) => {
    const planned = plannedById.get(approved.id);
    return Boolean(
      planned
      && planned.name === approved.name
      && isDeepStrictEqual(planned.input, approved.input)
    );
  });
  if (!allMatch) {
    throw new BadRequestError("Approved tool calls must come from the current reviewed plan");
  }
}

/** @internal Pure guard exported for deterministic boundary tests. */
export function validateCustomerFacingApprovalSet(
  verdict: AutonomyVerdict,
  approvedToolCalls: RawToolCall[],
): void {
  const approvedExecutable = approvedToolCalls.filter((call) => {
    const category = TOOL_CATEGORIES[call.name];
    return Boolean(category && EXECUTABLE_CATEGORIES.has(category));
  });
  const includesCustomerSend = approvedExecutable.some(
    (call) => call.name === "send_reply" || call.name === "send_email",
  );
  if (!includesCustomerSend || !("toolCalls" in verdict)) return;

  const plannedIds = new Set(verdict.toolCalls.map((call) => call.id));
  const unchanged = approvedExecutable.length === verdict.toolCalls.length
    && approvedExecutable.every((call) => plannedIds.has(call.id));
  if (!unchanged) {
    throw new BadRequestError(
      "Changing action steps requires a revised customer reply and a newly reviewed plan",
    );
  }
}

function validateExpectedIdentity(
  current: CurrentCachedPlan & { plan: AgentPlan },
  expected: ExpectedPlanIdentity | undefined,
): void {
  if (!expected) return;
  const currentPlanHash = hashPlan(current.plan);
  const currentInstructionHash = hashInstruction(current.instruction);
  const mismatch = (expected.planId && expected.planId !== current.planId)
    || (expected.sourceMessageId && expected.sourceMessageId !== current.lastCustomerMessageId)
    || (expected.planHash && expected.planHash !== currentPlanHash)
    || (expected.instructionHash && expected.instructionHash !== currentInstructionHash);
  if (mismatch) {
    throw new ConflictError("This plan is no longer current. Review the latest plan before approving it.");
  }
}

function terminalStatusForResult(result: AgentResult): "committed" | "failed" | "unknown" {
  return ledgerStatusForPlanOutcome(planExecutionOutcomeForResult(result));
}

function executionError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  allowMutativeAutoExecute?: boolean;
}): Promise<CurrentCachedPlan> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  const cachedPlan = readAgentPlanCache(thread.cachedPlan);
  const latestConversation = await getLatestConversationMessage(params.threadId, params.orgId);
  const pendingCustomerMessageId = latestConversation
    ? getPendingCustomerMessageId([latestConversation])
    : null;
  const instruction = cachedPlan?.instruction ?? "";
  const plan = cachedPlan
    && pendingCustomerMessageId
    && thread.cachedPlanMessageId === pendingCustomerMessageId
    && isAgentPlanCacheHit({
      cache: cachedPlan,
      instruction,
      lastCustomerMessageId: pendingCustomerMessageId,
      settings: params.settings,
    })
    ? cachedPlan.plan
    : null;

  const autonomyContext = {
    filterStatus: thread.filterStatus,
    threadEscalated: Boolean(thread.escalatedAt),
    allowMutativeAutoExecute: params.allowMutativeAutoExecute,
  };
  const verdict = plan
    ? decideAutonomy(plan, params.settings, autonomyContext)
    : decideAutonomy({
        instruction: "",
        steps: [],
        rawToolCalls: [],
        routingEvidence: { classifierState: "not_applicable", codes: [] },
      }, params.settings, autonomyContext);
  return {
    channel: thread.channelType,
    instruction,
    lastCustomerMessageId: cachedPlan?.lastCustomerMessageId ?? null,
    planId: cachedPlan?.planId ?? null,
    plan,
    verdict,
    failureReplan: cachedPlan?.failureReplan ?? null,
  };
}

export async function consumeThreadCachedPlan(params: {
  orgId: string;
  threadId: string;
  lastCustomerMessageId: string | null;
}) {
  await db.thread.updateMany({
    where: {
      id: params.threadId,
      organizationId: params.orgId,
      cachedPlanMessageId: params.lastCustomerMessageId,
    },
    data: {
      cachedPlan: Prisma.DbNull,
      cachedPlanMessageId: null,
    },
  });
}

export async function clearThreadPlanCache(params: {
  orgId: string;
  threadId: string;
}) {
  await db.thread.updateMany({
    where: {
      id: params.threadId,
      organizationId: params.orgId,
    },
    data: {
      cachedPlan: Prisma.DbNull,
      cachedPlanMessageId: null,
    },
  });
}

/** Clears only the exact cached plan the caller reviewed, never a newer replacement. */
export async function dismissCurrentCachedPlan(params: {
  orgId: string;
  threadId: string;
  expectedPlanId: string;
}): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ cachedPlan: unknown }>>(Prisma.sql`
      SELECT "cached_plan" AS "cachedPlan"
      FROM "threads"
      WHERE "id" = ${params.threadId}::uuid
        AND "organization_id" = ${params.orgId}::uuid
      FOR UPDATE
    `);
    const cached = locked[0]?.cachedPlan;
    if (!cached || typeof cached !== "object" || Array.isArray(cached)) return false;
    const planId = (cached as { planId?: unknown }).planId;
    if (planId !== params.expectedPlanId) return false;

    const execution = await tx.planExecution.findUnique({
      where: {
        organizationId_planId: {
          organizationId: params.orgId,
          planId: params.expectedPlanId,
        },
      },
      select: { status: true },
    });
    if (execution && execution.status !== "pending" && execution.status !== "failed") {
      throw new ConflictError("This plan has already been approved or is currently running.");
    }

    const cleared = await tx.thread.updateMany({
      where: { id: params.threadId, organizationId: params.orgId },
      data: { cachedPlan: Prisma.DbNull, cachedPlanMessageId: null },
    });
    if (cleared.count === 1) {
      await recordRequestEpisodeDismissed({
        orgId: params.orgId,
        planId: params.expectedPlanId,
      });
    }
    return cleared.count === 1;
  });
}

export async function executeCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  executionIntent: ExecutionIntent;
  failureRoute: string;
  approver?: ApproverIdentity;
  approvedToolCalls?: RawToolCall[];
  expectedIdentity?: ExpectedPlanIdentity;
  allowMutativeAutoExecute?: boolean;
  /** When false, suppresses the one bounded child replan after a definite failure. */
  failureReplanAllowed?: boolean;
}, deps: PlanExecutionDeps): Promise<ExecutedCachedPlan> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  if (shouldBlockTrustedSendActions(thread.filterStatus)) {
    throw new BadRequestError("Review the sender before sending");
  }

  const current = await loadCurrentCachedHomePlan(params);

  if (current.plan && isInvalidPlan(current.plan)) {
    throw new BadRequestError(
      "This draft is invalid and cannot be approved. Regenerate, revise, dismiss, or take over.",
    );
  }

  if (!current.plan) {
    throw new BadRequestError("Only current approved plans can be executed from this route");
  }

  const verdict = current.verdict;
  const automaticAllowed = verdict.kind === "quick_reply" || verdict.kind === "auto_execute";
  const merchantAllowed = automaticAllowed
    || verdict.kind === "escalate"
    || (verdict.kind === "needs_review" && verdict.approvalAllowed);
  if (
    (params.executionIntent === "automatic" && !automaticAllowed)
    || (params.executionIntent === "merchant_approved" && !merchantAllowed)
  ) {
    throw new BadRequestError("This plan is not executable for the requested approval path");
  }

  validateExpectedIdentity({ ...current, plan: current.plan }, params.expectedIdentity);

  const approvedToolCalls = params.approvedToolCalls
    ?? ("toolCalls" in verdict ? verdict.toolCalls : []);
  validateApprovedToolCalls(current.plan, approvedToolCalls);
  validateCustomerFacingApprovalSet(verdict, approvedToolCalls);
  if (!approvedToolCalls.some((call) => {
    const category = TOOL_CATEGORIES[call.name];
    return Boolean(category && EXECUTABLE_CATEGORIES.has(category));
  })) {
    throw new BadRequestError("The current plan has no executable tool calls");
  }

  const auditMode = params.executionIntent === "automatic"
    ? "auto_executed"
    : "human_approved";
  const approval: AgentActionApproval | undefined = auditMode === "human_approved" && params.approver
    ? {
        approverId: formatApproverId(params.approver),
        approvedAt: new Date(),
        approvedPlanHash: hashPlan(current.plan),
        instructionHash: hashInstruction(current.instruction),
      }
    : undefined;

  if (!current.planId || !current.lastCustomerMessageId) {
    throw new ConflictError("This plan predates durable approvals. Regenerate it before executing.");
  }

  // The PostgreSQL transition is the correctness boundary across dashboard,
  // gateway, devices, and Redis instances. No approved tool reaches its
  // provider until this durable intent exists and this caller owns its token.
  const identity: PlanExecutionIdentity = {
    orgId: params.orgId,
    planId: current.planId,
    threadId: params.threadId,
    sourceMessageId: current.lastCustomerMessageId,
    planHash: hashPlan(current.plan),
    instructionHash: hashInstruction(current.instruction),
    mode: auditMode,
    approverId: approval?.approverId,
    approvedAt: approval?.approvedAt,
  };
  const ledgerMode = resolvePlanExecutionLedgerMode();
  let executionId: string | undefined;
  let claimToken: string | undefined;
  if (ledgerMode === "enforce") {
    const claim = await claimCurrentPlanExecution(identity);
    if (!claim.claimed || !claim.claimToken) {
      throw new ConflictError("This plan has already been approved or is currently running.");
    }
    executionId = claim.execution.id;
    claimToken = claim.claimToken;
  }

  let result: AgentResult;
  let terminalExecutionStatus: "committed" | "failed" | "unknown" = "committed";
  try {
    result = await executeAgentTurn({
      orgId: params.orgId,
      threadId: params.threadId,
      instruction: current.instruction,
      failureRoute: params.failureRoute,
      orgSettings: params.settings,
      approvedToolCalls,
      persistAuditNote: true,
      auditMode,
      ...(executionId ? { executionId } : {}),
      ...(approval ? { approval } : {}),
    }, deps);
    terminalExecutionStatus = terminalStatusForResult(result);
    if (executionId && claimToken) {
      await completePlanExecution({
        executionId,
        claimToken,
        status: terminalExecutionStatus,
        error: findFailedToolResult(result)?.result ?? null,
      });
    }
  } catch (error) {
    // A whole-turn throw can occur after a provider accepted a mutation. Until
    // P3 reconciliation can prove otherwise, preserve the ambiguity as unknown
    // and never make the reviewed plan claimable again.
    if (executionId && claimToken) {
      terminalExecutionStatus = "unknown";
      await completePlanExecution({
        executionId,
        claimToken,
        status: terminalExecutionStatus,
        error: executionError(error),
      }).catch(() => undefined);
    }
    if (current.planId) {
      await recordRequestEpisodeExecution({
        orgId: params.orgId,
        planId: current.planId,
        planExecutionId: executionId ?? null,
        executionStatus: "unknown",
        executionIntent: params.executionIntent,
        planVerdict: current.verdict.kind,
      });
    }
    await escalateThreadForUnknownPlanExecution({
      orgId: params.orgId,
      threadId: params.threadId,
      reason: executionError(error),
    });
    throw error;
  } finally {
    await consumeThreadCachedPlan({
      orgId: params.orgId,
      threadId: params.threadId,
      lastCustomerMessageId: current.lastCustomerMessageId,
    });
  }

  if (current.planId) {
    await recordRequestEpisodeExecution({
      orgId: params.orgId,
      planId: current.planId,
      planExecutionId: executionId ?? null,
      executionStatus: terminalExecutionStatus,
      executionIntent: params.executionIntent,
      planVerdict: current.verdict.kind,
    });
  }

  const executionOutcome = planExecutionOutcomeForResult(result);
  if (isUnknownPlanExecution(executionOutcome)) {
    await escalateThreadForUnknownPlanExecution({
      orgId: params.orgId,
      threadId: params.threadId,
      reason: findFailedToolResult(result)?.result ?? "Unknown provider outcome during plan execution.",
    });
    return {
      ...current,
      plan: current.plan,
      approvedToolCalls,
      execution: {
        id: executionId ?? null,
        status: executionOutcome,
      },
      result,
    };
  }

  const failureReplanAllowed = params.failureReplanAllowed !== false
    && !current.failureReplan
    && Boolean(deps.planAgent);
  if (
    failureReplanAllowed
    && isDefinitePlanExecutionFailure(executionOutcome)
    && deps.planAgent
  ) {
    const childCache = await attemptFailureReplanAfterExecution({
      orgId: params.orgId,
      threadId: params.threadId,
      settings: params.settings,
      instruction: current.instruction,
      sourceMessageId: current.lastCustomerMessageId,
      parentPlanId: current.planId,
      parentPlan: current.plan,
      parentVerdict: verdict,
      approvedToolCalls,
      result,
      allowMutativeAutoExecute: params.allowMutativeAutoExecute,
      buildContext: deps.buildContext,
      planAgent: deps.planAgent,
    });
    if (childCache) {
      const childExecuted = await executeCurrentCachedHomePlan({
        ...params,
        failureReplanAllowed: false,
      }, deps);
      if (!childCache.failureReplan) {
        return childExecuted;
      }
      return {
        ...childExecuted,
        failureReplanRecovery: {
          parentResult: result,
          parentPlan: current.plan,
          context: childCache.failureReplan,
        },
      };
    }
  }

  return {
    ...current,
    plan: current.plan,
    approvedToolCalls,
    execution: {
      id: executionId ?? null,
      status: planExecutionOutcomeForResult(result),
    },
    result,
  };
}

export async function maybeAutoExecuteCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  failureRoute: string;
  /** Business-hours and rollout gate for plans that mutate store state. */
  allowMutativeAutoExecute?: boolean;
}, deps: PlanExecutionDeps): Promise<ExecutedCachedPlan | null> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  if (shouldSkipAutoPlan(thread.filterStatus)) {
    return null;
  }

  const current = await loadCurrentCachedHomePlan(params);
  if (!current.plan) {
    return null;
  }

  // A structurally clean quick reply is the low-risk conversational lane: one
  // customer-facing send, optional reads, no mutation, no merchant question and
  // no blocking signal. It is ordinary support work, so every tier except the
  // explicit Draft only tier (which classifies it as needs_review) sends it
  // without consuming merchant attention. The mutative rollout switch below is
  // deliberately irrelevant here; turning on clarifying questions must not turn
  // on refunds or order changes.
  if (current.verdict.kind === "quick_reply") {
    return executeCurrentCachedHomePlan({
      ...params,
      executionIntent: "automatic",
    }, deps);
  }

  if (current.verdict.kind !== "auto_execute" || params.allowMutativeAutoExecute === false) {
    return null;
  }

  if (!isAutoExecuteEnabled(params.settings)) {
    return null;
  }

  return executeCurrentCachedHomePlan({
    ...params,
    executionIntent: "automatic",
  }, deps);
}

export function findFailedToolResult(result: AgentResult): { tool: string; result: string } | null {
  return result.actionsPerformed.find((action) => (
    action.status === "error" || action.status === "policy_block" || action.status === "unknown"
  )) ?? null;
}
