import { Prisma, db } from "@shopkeeper/db";
import { ConflictError } from "../errors.js";
import { recordRequestEpisodeDismissed } from "../request-outcome.js";
import { rejectAgentProposal } from "../task-approval.js";

export async function consumeThreadCachedPlan(params: {
  orgId: string;
  threadId: string;
  lastCustomerMessageId: string | null;
  expectedPlanId?: string | null;
}) {
  if (params.expectedPlanId) {
    await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{
        cachedPlan: unknown;
        cachedPlanMessageId: string | null;
      }>>(Prisma.sql`
        SELECT "cached_plan" AS "cachedPlan", "cached_plan_message_id" AS "cachedPlanMessageId"
        FROM "threads"
        WHERE "id" = ${params.threadId}::uuid
          AND "organization_id" = ${params.orgId}::uuid
        FOR UPDATE
      `);
      const current = locked[0];
      if (current?.cachedPlanMessageId !== params.lastCustomerMessageId) return;
      const cached = current.cachedPlan;
      if (!cached || typeof cached !== "object" || Array.isArray(cached)) return;
      if ((cached as { planId?: unknown }).planId !== params.expectedPlanId) return;
      await tx.thread.updateMany({
        where: { id: params.threadId, organizationId: params.orgId },
        data: { cachedPlan: Prisma.DbNull, cachedPlanMessageId: null },
      });
    });
    return;
  }
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

/**
 * Clears only the exact cached plan the caller reviewed, never a newer
 * replacement, and ends the durable approval wait that plan was parked under.
 *
 * The dismissing member is required rather than optional. A dismissal and an
 * approval end the same wait, so they answer to the same recorded scope; a
 * surface allowed to dismiss without saying who would be a second owner of that
 * decision, which is what made the phone and the dashboard disagree about
 * approvals.
 */
export async function dismissCurrentCachedPlan(params: {
  orgId: string;
  threadId: string;
  expectedPlanId: string;
  clerkUserId: string;
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

    // Before the draft is destroyed, not after: a member the proposal refuses
    // throws out of here with the card still parked for whoever may decide it.
    await rejectAgentProposal(tx, {
      organizationId: params.orgId,
      clerkUserId: params.clerkUserId,
      proposalId: params.expectedPlanId,
    });

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
