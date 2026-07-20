import { Prisma, db, type DbChannelType } from "@shopkeeper/db";
import { isDeepStrictEqual } from "node:util";
import { BadRequestError, ConflictError } from "./errors.js";
import { executeAgentTurn, type ExecuteAgentTurnDeps } from "./turn.js";
import { getLatestConversationMessage, requireOrgThread } from "./thread-auth.js";
import { isAgentPlanCacheHit, readAgentPlanCache } from "./plan-cache.js";
import { getPendingCustomerMessageId } from "./plan-cache-shape.js";
import { hashInstruction, hashPlan, type AgentActionApproval } from "./agent-actions.js";
import { classifyHomePlan, type HomePlanClassification, type HomePlanKind } from "./plan-preview.js";
import { shouldBlockTrustedSendActions, shouldSkipAutoPlan } from "./sender-trust.js";
import { resolveAutoExecuteMode } from "./settings.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import { planExecutionOutcomeForResult } from "./execution-outcome.js";
import type { AgentResult } from "./agent-context.js";
import type { AgentPlan, OrgSettings, PlanExecutionOutcome, RawToolCall } from "./types.js";
import {
  claimCurrentPlanExecution,
  completePlanExecution,
  observePlanExecution,
  type PlanExecutionIdentity,
} from "./execution-ledger.js";
import logger from "./logger.js";

// Host-injected shadow recorder (Track 4.1). The dashboard wires this to the
// real AutonomyShadowDecision rig; the gateway worker supplies a no-op (the rig
// is a dashboard-rollout-only system per the trim list).
export interface ShadowRecorder {
  recordShadowDecision(p: { orgId: string; threadId: string; settings: OrgSettings; plan: AgentPlan }): Promise<void>;
  resolveShadowDecisionOnApproval(p: { orgId: string; threadId: string; approvedToolCalls: RawToolCall[] }): Promise<void>;
}

export interface PlanExecutionDeps extends ExecuteAgentTurnDeps {
  shadow: ShadowRecorder;
}

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
  classification: HomePlanClassification;
}

interface ExecutedCachedPlan extends CurrentCachedPlan {
  plan: AgentPlan;
  approvedToolCalls: RawToolCall[];
  execution: {
    id: string | null;
    status: PlanExecutionOutcome;
  };
  result: AgentResult;
}

export interface ExpectedPlanIdentity {
  planId?: string | null;
  sourceMessageId?: string | null;
  planHash?: string | null;
  instructionHash?: string | null;
}

export type PlanExecutionLedgerMode = "off" | "shadow" | "enforce";

export function resolvePlanExecutionLedgerMode(
  value: string | undefined = process.env.PLAN_EXECUTION_LEDGER_MODE,
): PlanExecutionLedgerMode {
  return value === "off" || value === "shadow" ? value : "enforce";
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

function toolCallsForClassification(
  plan: AgentPlan,
  classification: HomePlanClassification,
): RawToolCall[] {
  if (classification.kind === "quick_reply") {
    return classification.sendReplyToolCall ? [classification.sendReplyToolCall] : [];
  }
  // auto_execute (system) and needs_review (human one-tap approve) both run the
  // full executable plan; runtime policy in the executor remains the backstop.
  return getExecutablePlanToolCalls(plan);
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
  const outcome = planExecutionOutcomeForResult(result);
  return outcome === "partial" ? "failed" : outcome;
}

function executionError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
}): Promise<CurrentCachedPlan> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  const cachedPlan = readAgentPlanCache(thread.cachedPlan);
  const latestConversation = await getLatestConversationMessage(params.threadId);
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

  return {
    channel: thread.channelType,
    instruction,
    lastCustomerMessageId: cachedPlan?.lastCustomerMessageId ?? null,
    planId: cachedPlan?.planId ?? null,
    plan,
    classification: classifyHomePlan(plan, params.settings, { filterStatus: thread.filterStatus }),
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

export async function executeCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  allowedKinds: HomePlanKind[];
  failureRoute: string;
  approver?: ApproverIdentity;
  approvedToolCalls?: RawToolCall[];
  expectedIdentity?: ExpectedPlanIdentity;
}, deps: PlanExecutionDeps): Promise<ExecutedCachedPlan> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  if (shouldBlockTrustedSendActions(thread.filterStatus)) {
    throw new BadRequestError("Review the sender before sending");
  }

  const current = await loadCurrentCachedHomePlan(params);

  if (!current.plan || !params.allowedKinds.includes(current.classification.kind)) {
    throw new BadRequestError("Only current approved plans can be executed from this route");
  }

  validateExpectedIdentity({ ...current, plan: current.plan }, params.expectedIdentity);

  const approvedToolCalls = params.approvedToolCalls
    ?? toolCallsForClassification(current.plan, current.classification);
  validateApprovedToolCalls(current.plan, approvedToolCalls);
  if (approvedToolCalls.length === 0) {
    throw new BadRequestError("The current plan has no executable tool calls");
  }

  const auditMode = current.classification.kind === "auto_execute" && params.approvedToolCalls === undefined
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
  } else if (ledgerMode === "shadow") {
    try {
      const observed = await observePlanExecution(identity);
      executionId = observed.id;
      if (observed.observationCount > 1) {
        logger.warn({
          orgId: params.orgId,
          threadId: params.threadId,
          planId: current.planId,
          observationCount: observed.observationCount,
        }, "[plan-execution] shadow observed repeated execution of one plan");
      }
    } catch (error) {
      logger.error({ err: error, orgId: params.orgId, threadId: params.threadId }, "[plan-execution] shadow observation failed");
    }
  }

  let result: AgentResult;
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
    if (executionId && claimToken) {
      await completePlanExecution({
        executionId,
        claimToken,
        status: terminalStatusForResult(result),
        error: findFailedToolResult(result)?.result ?? null,
      });
    }
  } catch (error) {
    // A whole-turn throw can occur after a provider accepted a mutation. Until
    // P3 reconciliation can prove otherwise, preserve the ambiguity as unknown
    // and never make the reviewed plan claimable again.
    if (executionId && claimToken) {
      await completePlanExecution({
        executionId,
        claimToken,
        status: "unknown",
        error: executionError(error),
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    await consumeThreadCachedPlan({
      orgId: params.orgId,
      threadId: params.threadId,
      lastCustomerMessageId: current.lastCustomerMessageId,
    });
  }

  if (auditMode === "human_approved") {
    await deps.shadow.resolveShadowDecisionOnApproval({
      orgId: params.orgId,
      threadId: params.threadId,
      approvedToolCalls,
    });
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
}, deps: PlanExecutionDeps): Promise<ExecutedCachedPlan | null> {
  const mode = resolveAutoExecuteMode(params.settings);
  if (mode === "off") {
    return null;
  }

  const thread = await requireOrgThread(params.threadId, params.orgId);
  if (shouldSkipAutoPlan(thread.filterStatus)) {
    return null;
  }

  const current = await loadCurrentCachedHomePlan(params);
  if (!current.plan || current.classification.kind !== "auto_execute") {
    return null;
  }

  if (mode === "shadow") {
    // Record what we would have auto-executed; still route to human approval.
    await deps.shadow.recordShadowDecision({
      orgId: params.orgId,
      threadId: params.threadId,
      settings: params.settings,
      plan: current.plan,
    });
    return null;
  }

  return executeCurrentCachedHomePlan({
    ...params,
    allowedKinds: ["auto_execute"],
  }, deps);
}

export function findFailedToolResult(result: AgentResult): { tool: string; result: string } | null {
  return result.actionsPerformed.find((action) => (
    action.status === "error" || action.status === "policy_block" || action.status === "unknown"
  )) ?? null;
}
