// Shared collision logic for the P5-04 escalation backfill (`pending` -> `open`
// + `escalated_at`). Both the read-only audit (audit-escalation-backfill.mjs)
// and the read-write backfill (backfill-escalation.mjs) call this, so the gate
// and the writer cannot drift.
//
// Backfilling flips live `pending` threads to `open`. The only hard constraint
// is the `threads_one_open_per_customer` partial unique index:
//
//   UNIQUE (organization_id, customer_id, channel_type) WHERE status = 'open'
//
// After the flip a group may hold at most one `status='open'` row. We match that
// index literally: existing opens are counted as `status='open'` with NO
// deleted/archived filter (the index counts those rows too), while the flip
// target is live pending only (`deleted_at IS NULL AND archived_at IS NULL`) —
// archived or deleted pending threads are intentionally left as-is (already out
// of the inbox, so flipping them would only resurrect an index slot for nothing).
//
// A group collides when flipping its live pending rows would leave >= 2 opens:
//
//   flipCount >= 1 AND existingOpen + flipCount >= 2
//
// This covers BOTH the open>=1 & pending>=1 case AND the previously-missed
// open=0 & pending>=2 case (two split escalations for one customer — reachable
// via exactly the pre-P5-04 split bug this column fixes: escalate -> pending
// (0 open) -> customer replies -> a second thread splits off and also escalates).
//
// Null customers are not handled specially: the escalate-to-human path only ran
// on customer support tickets, so every historical `pending` thread has a
// customer, and no null-customer pending rows exist to group.

export function classifyEscalationGroups(groups) {
  const collisionGroups = [];
  let pendingThreadsToBackfill = 0;
  let backfillableCount = 0;

  for (const group of groups) {
    const existingOpen = Number(group.existingOpen);
    const flipCount = Number(group.flipCount);
    pendingThreadsToBackfill += flipCount;

    if (flipCount >= 1 && existingOpen + flipCount >= 2) {
      collisionGroups.push({
        organizationId: group.organizationId,
        customerId: group.customerId,
        channelType: group.channelType,
        existingOpen,
        flipCount,
      });
    } else {
      backfillableCount += flipCount;
    }
  }

  return {
    pendingThreadsToBackfill,
    backfillableCount,
    collisionGroups,
    collisionGroupCount: collisionGroups.length,
    safeToBackfill: collisionGroups.length === 0,
  };
}

// Fetch, per (org, customer, channel), the count of existing opens (matching the
// index predicate exactly) and the count of live pending threads the backfill
// would flip. Only groups with at least one flip candidate are returned.
export async function fetchEscalationGroups(db) {
  const rows = await db.$queryRaw`
    SELECT
      organization_id::text AS "organizationId",
      customer_id::text     AS "customerId",
      channel_type::text    AS "channelType",
      COUNT(*) FILTER (WHERE status = 'open') AS "existingOpen",
      COUNT(*) FILTER (
        WHERE status = 'pending' AND deleted_at IS NULL AND archived_at IS NULL
      ) AS "flipCount"
    FROM threads
    WHERE status IN ('open', 'pending')
    GROUP BY organization_id, customer_id, channel_type
    HAVING COUNT(*) FILTER (
      WHERE status = 'pending' AND deleted_at IS NULL AND archived_at IS NULL
    ) > 0
    ORDER BY "flipCount" DESC
  `;

  return rows.map((row) => ({
    organizationId: row.organizationId,
    customerId: row.customerId,
    channelType: row.channelType,
    existingOpen: Number(row.existingOpen),
    flipCount: Number(row.flipCount),
  }));
}

export async function computeEscalationBackfillReport(db) {
  return classifyEscalationGroups(await fetchEscalationGroups(db));
}
