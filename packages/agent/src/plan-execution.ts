import { Prisma, db, type DbChannelType } from "@shopkeeper/db";
import { BadRequestError } from "./errors.js";
import { executeAgentTurn, type ExecuteAgentTurnDeps } from "./turn.js";
import { getLatestConversationMessage, requireOrgThread } from "./thread-auth.js";
import { isAgentPlanCacheHit, readAgentPlanCache } from "./plan-cache.js";
import { getPendingCustomerMessageId } from "./plan-cache-shape.js";
import { hashInstruction, hashPlan, type AgentActionApproval } from "./agent-actions.js";
import { classifyHomePlan, type HomePlanClassification, type HomePlanKind } from "./plan-preview.js";
import { shouldBlockTrustedSendActions, shouldSkipAutoPlan } from "./sender-trust.js";
import { resolveAutoExecuteMode } from "./settings.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import type { AgentResult } from "./agent-context.js";
import type { AgentPlan, OrgSettings, RawToolCall } from "./types.js";

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
  result: AgentResult;
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
}, deps: PlanExecutionDeps): Promise<ExecutedCachedPlan> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  if (shouldBlockTrustedSendActions(thread.filterStatus)) {
    throw new BadRequestError("Review the sender before sending");
  }

  const current = await loadCurrentCachedHomePlan(params);

  if (!current.plan || !params.allowedKinds.includes(current.classification.kind)) {
    throw new BadRequestError("Only current approved plans can be executed from this route");
  }

  const approvedToolCalls = toolCallsForClassification(current.plan, current.classification);
  if (approvedToolCalls.length === 0) {
    throw new BadRequestError("The current plan has no executable tool calls");
  }

  const auditMode = current.classification.kind === "auto_execute" ? "auto_executed" : "human_approved";
  const approval: AgentActionApproval | undefined = auditMode === "human_approved" && params.approver
    ? {
        approverId: formatApproverId(params.approver),
        approvedAt: new Date(),
        approvedPlanHash: hashPlan(current.plan),
        instructionHash: hashInstruction(current.instruction),
      }
    : undefined;

  const result = await executeAgentTurn({
    orgId: params.orgId,
    threadId: params.threadId,
    instruction: current.instruction,
    failureRoute: params.failureRoute,
    orgSettings: params.settings,
    approvedToolCalls,
    persistAuditNote: true,
    auditMode,
    ...(approval ? { approval } : {}),
  }, deps).finally(() => consumeThreadCachedPlan({
    orgId: params.orgId,
    threadId: params.threadId,
    lastCustomerMessageId: current.lastCustomerMessageId,
  }));

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
    action.status === "error" || action.status === "policy_block"
  )) ?? null;
}
