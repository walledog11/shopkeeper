// P9-02 retired-ChannelType gate (READ-ONLY).
//
// Gates migration 20260920120000_drop_retired_channel_types, which recreates the
// ChannelType enum without `sms`, `imessage` and `sms_agent`. Operator iMessage is
// `operator` threads plus org_member_imessage_bindings; the `'imessage'` strings
// elsewhere in the gateway are transport/provider names, not this enum.
//
//   npm run audit:legacy-imessage-threads
//   npm run audit:legacy-imessage-threads -- --strict
//
// Everything below is raw SQL comparing `::text`, deliberately. The enum members
// are gone from the Prisma client, so `ChannelType.imessage` is `undefined` — and
// Prisma reads an `undefined` filter value as "no filter", which silently counts
// every row instead of none. That is not hypothetical: this script shipped with
// `channelType: ChannelType.sms_agent` after 6ca7556e removed that member, and so
// reported the total active thread count as its sms_agent count. Casting to text
// also makes the audit idempotent across the migration it gates.
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');

const strict = process.argv.includes('--strict');

// Prisma applies migrations in filename order, so this gate asks whether
// 20260920120000 succeeds *given the six pending migrations that precede it*, not
// whether the database looks final today.
//
// `sms` and `imessage` are the values nothing converts. A row holding either one
// reaches the retype and fails it with 22P02, so these block.
const BLOCKING_RETIRED = ['sms', 'imessage'];

// `sms_agent` is retired by `ALTER TYPE ... RENAME VALUE` in
// 20260911120000_rename_sms_agent_channel_to_operator, which runs first and
// repoints every existing row at `operator` in place — no backfill, no row rewrite.
// Those rows never reach 20260920120000 as a retired value. Counted and reported
// so the inventory is honest, never blocking.
const RENAMED_BEFORE_THIS_MIGRATION = ['sms_agent'];

const RETIRED = [...BLOCKING_RETIRED, ...RENAMED_BEFORE_THIS_MIGRATION];

// A table absent because a migration EARLIER in the same pending queue creates it.
// It exists and is empty by the time this migration runs, so it cannot hold a
// retired value. Absent for any reason not listed here is unexplained and blocks.
const CREATED_BY_EARLIER_PENDING_MIGRATION = {
  agent_requests: '20260915160000_add_durable_agent_requests',
};

// Every column the migration retypes. A retired value in ANY of them fails the
// `USING "col"::text::"ChannelType_new"` cast with 22P02 and aborts the deploy,
// so counting threads alone does not clear the migration.
const COLUMNS = [
  ['threads', 'channel_type'],
  ['integrations', 'platform'],
  ['integration_disconnects', 'platform'],
  ['request_episode_outcomes', 'channel_type'],
  ['agent_requests', 'channel'],
];

// A table can be legitimately absent: this audit runs against databases that are
// behind on migrations, which is exactly when it is most needed. Absent is
// reported as absent, never silently folded into a zero — a zero here reads as
// "checked and clear" and would clear the gate on a column nobody looked at.
const presentTables = new Set(
  (
    await db.$queryRawUnsafe(
      `SELECT c.relname AS name FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
      COLUMNS.map(([table]) => table),
    )
  ).map((r) => r.name),
);

const retiredValueRows = {};
const absentTables = [];
const unexplainedAbsentTables = [];
let blockingRows = 0;
let renamedInFlightRows = 0;
for (const [table, column] of COLUMNS) {
  if (!presentTables.has(table)) {
    const createdBy = CREATED_BY_EARLIER_PENDING_MIGRATION[table];
    absentTables.push(createdBy ? `${table} (created empty by ${createdBy})` : table);
    if (!createdBy) unexplainedAbsentTables.push(table);
    retiredValueRows[`${table}.${column}`] = createdBy
      ? `table absent — created empty by ${createdBy}, which runs first`
      : 'table absent — UNEXPLAINED';
    continue;
  }
  const rows = await db.$queryRawUnsafe(
    `SELECT "${column}"::text AS value, COUNT(*)::int AS count
       FROM "${table}"
      WHERE "${column}"::text = ANY($1::text[])
      GROUP BY 1 ORDER BY 1`,
    RETIRED,
  );
  const byValue = Object.fromEntries(rows.map((r) => [r.value, r.count]));
  retiredValueRows[`${table}.${column}`] = byValue;
  for (const row of rows) {
    if (BLOCKING_RETIRED.includes(row.value)) blockingRows += row.count;
    else renamedInFlightRows += row.count;
  }
}

// Soft-deleted threads count too: the migration retypes the column, not the rows
// the app still reads, so a soft-deleted row blocks it exactly as a live one does.
const softDeletedBlockingThreads = presentTables.has('threads')
  ? (
      await db.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "threads"
          WHERE "channel_type"::text = ANY($1::text[]) AND "deleted_at" IS NOT NULL`,
        BLOCKING_RETIRED,
      )
    )[0].count
  : null;

// Objects whose definition embeds the enum must be dropped and rebuilt inside the
// migration. Production has carried an index that schema.prisma did not declare
// before, so this is read from the live catalog rather than assumed: anything here
// that the migration does not recreate is dropped silently on deploy.
const dependents = await db.$queryRawUnsafe(
  `SELECT c.relname AS name, 'index' AS kind
     FROM pg_depend d JOIN pg_class c ON c.oid = d.objid
    WHERE d.refobjid = 'public."ChannelType"'::regtype AND c.relkind = 'i'
    UNION ALL
   SELECT con.conname AS name, 'constraint' AS kind
     FROM pg_depend d JOIN pg_constraint con ON con.oid = d.objid
    WHERE d.refobjid = 'public."ChannelType"'::regtype
    ORDER BY 2, 1`,
);

const REBUILT_BY_MIGRATION = [
  'integrations_non_email_account_unique',
  'integrations_instagram_organization_unique',
  'integrations_instagram_account_unique',
  'integrations_shopify_account_unique',
  'agent_requests_shape_check',
];
const unhandledDependents = dependents
  .map((d) => d.name)
  .filter((name) => !REBUILT_BY_MIGRATION.includes(name));

const enumValues = (
  await db.$queryRawUnsafe(
    `SELECT e.enumlabel AS value FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'ChannelType' ORDER BY e.enumsortorder`,
  )
).map((r) => r.value);

const report = {
  generatedAt: new Date().toISOString(),
  enumValues,
  migrationApplied: !RETIRED.some((v) => enumValues.includes(v)),
  retiredValueRows,
  absentTables,
  unexplainedAbsentTables,
  blockingRows,
  renamedInFlightRows,
  softDeletedBlockingThreads,
  dependents: dependents.map((d) => `${d.kind}:${d.name}`),
  unhandledDependents,
  safeToRunMigration:
    blockingRows === 0 &&
    unhandledDependents.length === 0 &&
    unexplainedAbsentTables.length === 0,
};

console.log(JSON.stringify(report, null, 2));

if (strict && !report.safeToRunMigration) {
  process.exitCode = 1;
}

await db.$disconnect();
