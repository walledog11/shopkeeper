import { Prisma, db } from "@clerk/db";
import { BadRequestError } from "@/lib/api/errors";
import { executeAgentTurn } from "@/lib/agent/api/execution";
import { requireOrgThread } from "@/lib/agent/api/auth";
import { isAgentPlanCacheHit, readAgentPlanCache } from "@/lib/agent/api/plan-cache";
import { hashInstruction, hashPlan, type AgentActionApproval } from "@/lib/agent/api/agent-actions";
import { classifyHomePlan, type HomePlanClassification, type HomePlanKind } from "@/lib/agent/plan-preview";
import { TOOL_CATEGORIES } from "@/lib/agent/tools/registry";
import type { AgentFailureAlertRoute } from "@/lib/server/agent-failure-alerts";
import type { AgentResult } from "@/lib/agent/types";
import type { AgentPlan, OrgSettings, RawToolCall } from "@/types";

export interface ApproverIdentity {
  clerkUserId: string;
  displayName: string | null;
}

export function formatApproverId(identity: ApproverIdentity): string {
  return identity.displayName ? `${identity.clerkUserId}:${identity.displayName}` : identity.clerkUserId;
}

interface CurrentCachedPlan {
  instruction: string;
  lastCustomerMessageId: string | null;
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
  return settings.autoExecuteEnabled === true;
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
  if (classification.kind === "auto_execute") {
    return getExecutablePlanToolCalls(plan);
  }
  return [];
}

async function loadCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
}): Promise<CurrentCachedPlan> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  const cachedPlan = readAgentPlanCache(thread.cachedPlan);
  const lastCustomerMessage = thread.messages[0] ?? null;
  const instruction = cachedPlan?.instruction ?? "";
  const plan = cachedPlan && thread.cachedPlanMessageId === lastCustomerMessage?.id && isAgentPlanCacheHit({
    cache: cachedPlan,
    instruction,
    lastCustomerMessageId: lastCustomerMessage?.id ?? null,
    settings: params.settings,
  }) ? cachedPlan.plan : null;

  return {
    instruction,
    lastCustomerMessageId: cachedPlan?.lastCustomerMessageId ?? null,
    plan,
    classification: classifyHomePlan(plan, params.settings),
  };
}

async function clearCurrentCachedPlan(params: {
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

export async function executeCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  allowedKinds: HomePlanKind[];
  failureRoute: AgentFailureAlertRoute;
  approver?: ApproverIdentity;
}): Promise<ExecutedCachedPlan> {
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
  }).finally(() => clearCurrentCachedPlan({
    orgId: params.orgId,
    threadId: params.threadId,
    lastCustomerMessageId: current.lastCustomerMessageId,
  }));

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
  failureRoute: AgentFailureAlertRoute;
}): Promise<ExecutedCachedPlan | null> {
  if (!isAutoExecuteEnabled(params.settings)) {
    return null;
  }

  const current = await loadCurrentCachedHomePlan(params);
  if (!current.plan || current.classification.kind !== "auto_execute") {
    return null;
  }

  return executeCurrentCachedHomePlan({
    ...params,
    allowedKinds: ["auto_execute"],
  });
}

export function findFailedToolResult(result: AgentResult): { tool: string; result: string } | null {
  return result.actionsPerformed.find((action) => (
    action.status === "error" || action.status === "policy_block"
  )) ?? null;
}
