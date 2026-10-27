// The durable worker's queue and the sweep that releases expired claims.

import { db, Prisma } from "@shopkeeper/db";
import { WITHHELD_MESSAGE_FOLLOW_UP } from "./withheld-follow-up.js";

/**
 * Queued work for the durable task worker: a member's own request, or a support
 * task queued for a withheld-message follow-up. Any other customer-initiated
 * support task is claimed in-process by the planning job that accepted it and
 * recovers through that job's own retries, so handing it to this queue would
 * only manufacture failures.
 */
export async function findQueuedAgentTasks(limit = 100) {
  return db.agentTask.findMany({
    where: {
      status: "queued", claimToken: null, cancelledAt: null,
      OR: [
        { initiatingActorKind: "member" },
        {
          initiatingActorKind: "customer",
          checkpoint: { path: ["nextWork"], equals: WITHHELD_MESSAGE_FOLLOW_UP },
        },
        { checkpoint: { path: ["nextWork"], equals: "ticket_plan" } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true, organizationId: true, revision: true },
  });
}

// An expired attempt is only definitely over when nothing reached the provider:
// no action dispatched and no execution claimed, committed or unknown, the test
// `claimAgentTask` applies before work runs from the top. A customer support
// attempt that ends that way failed, and `requeueFailedAttempt` decides whether
// its message re-runs it. It is charged no time past its last checkpoint: a dead
// worker did no work there, and a support lease is as long as the task's time
// limit, so charging it would leave the re-run nothing. A member turn can act on
// other threads' proposals, so its own rows prove nothing and it reconciles.
// Anything else still owes reconciliation, exactly as the worker-side settle and
// fail paths decide it.
//
// The rows are locked before the update reads them, so a dispatch authorized
// just before a lease ran out is seen rather than missed by a stale snapshot.
export async function reconcileExpiredAgentTaskClaims(now = new Date()) {
  const dispatched = Prisma.sql`(EXISTS (
    SELECT 1 FROM agent_actions a
    WHERE a.task_id = agent_tasks.id AND a.organization_id = agent_tasks.organization_id
    AND a.dispatch_state IN ('dispatch_authorized', 'submitted', 'unknown', 'settled')
  ) OR EXISTS (
    SELECT 1 FROM plan_executions e
    WHERE e.task_id = agent_tasks.id AND e.organization_id = agent_tasks.organization_id
    AND e.status IN ('claimed', 'committed', 'unknown')
  ))`;
  const interrupted = Prisma.sql`(cancelled_at IS NULL
    AND initiating_actor_kind = 'customer' AND NOT ${dispatched})`;
  return db.$transaction(async (tx) => {
    const expired = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM agent_tasks
      WHERE status = 'running' AND lease_expires_at <= ${now}
      ORDER BY id
      FOR UPDATE
    `);
    if (expired.length === 0) return 0;
    return tx.$executeRaw(Prisma.sql`
      UPDATE agent_tasks
      SET status = CASE WHEN ${interrupted} THEN 'failed'::"AgentTaskStatus"
                        WHEN cancelled_at IS NOT NULL AND NOT ${dispatched}
                        THEN 'cancelled'::"AgentTaskStatus"
                        ELSE 'reconciling'::"AgentTaskStatus" END,
          failure_code = CASE
            WHEN cancelled_at IS NULL THEN 'interrupted_attempt'
            WHEN ${dispatched} THEN 'cancelled_after_dispatch'
            ELSE NULL END,
          active_time_ms_used = CASE WHEN ${interrupted} THEN active_time_ms_used
            ELSE LEAST(2147483647,
              active_time_ms_used + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM
                (${now}::timestamptz - active_checkpoint_at)) * 1000)::integer)) END,
          claim_token = NULL,
          lease_expires_at = NULL,
          active_checkpoint_at = NULL,
          active_proposal_id = NULL,
          pending_question_id = NULL,
          pending_question = NULL,
          pending_answerer_kind = NULL,
          pending_answerer_key = NULL,
          last_progress_at = ${now}
      WHERE id IN (${Prisma.join(expired.map(({ id }) => Prisma.sql`${id}::uuid`))})
        AND status = 'running' AND lease_expires_at <= ${now}
    `);
  });
}
