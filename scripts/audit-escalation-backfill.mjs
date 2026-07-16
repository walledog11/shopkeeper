// P5-04 staged-backfill gate (READ-ONLY).
//
// The app layer now keeps escalated tickets `open` and records `escalated_at`,
// but historical escalations are still parked at status `pending`. Backfilling
// them (`pending -> open` + `escalated_at`) is safe only where it will not
// create a second `open` thread for the same (org, customer, channel) — that
// would violate the `threads_one_open_per_customer` partial unique index
// (`WHERE status = 'open'`).
//
// This script counts backfill candidates and lists the collision groups that a
// human must resolve first (merge/close the duplicate). It writes nothing.
//
//   npm run audit:escalation-backfill
//   npm run audit:escalation-backfill -- --strict   # exit 1 if collisions exist
import { db } from '@shopkeeper/db';

const strict = process.argv.includes('--strict');

const [pendingTotal, collisions] = await Promise.all([
  db.thread.count({ where: { status: 'pending', deletedAt: null } }),
  // Groups that already hold both an open and a pending thread — the backfill
  // would leave two open threads here, so these need manual resolution first.
  db.$queryRaw`
    SELECT
      organization_id::text AS "organizationId",
      customer_id::text     AS "customerId",
      channel_type::text    AS "channelType",
      COUNT(*) FILTER (WHERE status = 'open')    AS "openCount",
      COUNT(*) FILTER (WHERE status = 'pending') AS "pendingCount"
    FROM threads
    WHERE deleted_at IS NULL
      AND status IN ('open', 'pending')
    GROUP BY organization_id, customer_id, channel_type
    HAVING COUNT(*) FILTER (WHERE status = 'open') > 0
       AND COUNT(*) FILTER (WHERE status = 'pending') > 0
    ORDER BY "pendingCount" DESC
    LIMIT 200
  `,
]);

const report = {
  pendingThreadsToBackfill: pendingTotal,
  collisionGroups: collisions.map((row) => ({
    organizationId: row.organizationId,
    customerId: row.customerId,
    channelType: row.channelType,
    openCount: Number(row.openCount),
    pendingCount: Number(row.pendingCount),
  })),
  collisionGroupCount: collisions.length,
  safeToBackfill: collisions.length === 0,
};

console.log(JSON.stringify(report, null, 2));

if (strict && collisions.length > 0) {
  process.exitCode = 1;
}

await db.$disconnect();
