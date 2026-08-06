import { db } from "@shopkeeper/db";
import { memberOperatorKey } from "@shopkeeper/agent/internal-thread";
import { getPlanExecution } from "@shopkeeper/agent/execution-ledger";
import { isReadToolName, PLAN_STEP_LABELS } from "@shopkeeper/agent/tools";

const DRAFT_EXCERPT_LIMIT = 600;

export interface PendingPlanView {
  /** Stable plan identity. Absent on rows parked before durable identity shipped. */
  planId: string | null;
  threadId: string;
  customerName: string | null;
  /** Completes "I'd …" — the same phrase the operator plan card uses. */
  actionLabel: string | null;
  instruction: string;
  steps: string[];
  draft: string | null;
}

interface StoredPlan {
  threadId?: unknown;
  instruction?: unknown;
  planId?: unknown;
  customerName?: unknown;
  actionLabel?: unknown;
  rawToolCalls?: unknown;
}

function toolCalls(value: unknown): Array<{ name: string; input?: unknown }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { name, input } = entry as { name?: unknown; input?: unknown };
    return typeof name === "string" ? [{ name, input }] : [];
  });
}

function draftExcerpt(calls: Array<{ name: string; input?: unknown }>): string | null {
  for (const call of calls) {
    const input = call.input;
    if (!input || typeof input !== "object") continue;
    const body = call.name === "send_reply"
      ? (input as { text?: unknown }).text
      : call.name === "send_email"
        ? (input as { body?: unknown }).body
        : null;
    if (typeof body !== "string") continue;
    const trimmed = body.trim();
    if (!trimmed) continue;
    return trimmed.length > DRAFT_EXCERPT_LIMIT ? `${trimmed.slice(0, DRAFT_EXCERPT_LIMIT)}…` : trimmed;
  }
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

// The merchant's pending-plan queue — the same rows their phone's cards refer to,
// keyed to the person rather than the device. Plans whose execution already
// finished elsewhere (approved on a phone thirty seconds ago) are filtered out so
// an open panel stops offering a decision that has been made; the queue row itself
// is left to the gateway to resolve on the next operator turn.
export async function getOperatorPendingPlans(
  orgId: string,
  clerkUserId: string,
): Promise<PendingPlanView[]> {
  const member = await db.orgMember.findUnique({
    where: { organizationId_clerkUserId: { organizationId: orgId, clerkUserId } },
    select: { id: true },
  });
  if (!member) return [];

  const row = await db.operatorContext.findUnique({
    where: {
      organizationId_memberKey: { organizationId: orgId, memberKey: memberOperatorKey(member.id) },
    },
    select: { pendingPlans: true },
  });
  const stored = Array.isArray(row?.pendingPlans) ? row.pendingPlans as StoredPlan[] : [];

  const views: PendingPlanView[] = [];
  for (const plan of stored) {
    const threadId = str(plan?.threadId);
    if (!threadId) continue;

    const planId = str(plan?.planId);
    if (planId) {
      const execution = await getPlanExecution(orgId, planId).catch(() => null);
      if (execution && execution.status !== "pending" && execution.status !== "claimed") continue;
    }

    const calls = toolCalls(plan?.rawToolCalls);
    views.push({
      planId,
      threadId,
      customerName: str(plan?.customerName),
      actionLabel: str(plan?.actionLabel),
      instruction: str(plan?.instruction) ?? "",
      steps: calls
        .filter((call) => !isReadToolName(call.name))
        .map((call) => PLAN_STEP_LABELS[call.name] ?? call.name),
      draft: draftExcerpt(calls),
    });
  }

  // Newest last in storage; the panel leads with what arrived most recently.
  return views.reverse();
}
