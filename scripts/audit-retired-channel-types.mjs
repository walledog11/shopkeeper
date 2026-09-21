// Post-migration verification for retired ChannelType enum members (READ-ONLY).
//
// Confirms no rows still reference values removed from Postgres. Run after
// `db:migrate:deploy` when onboarding a new environment or after a channel retirement PR.
//
//   npm run audit:retired-channel-types
//   SHOPKEEPER_DB_TARGET=prod npm run audit:retired-channel-types -- --strict
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');
const { RETIRED_THREAD_CHANNEL_TYPES } = await import('@shopkeeper/shared/product-analytics');

const strict = process.argv.includes('--strict');

const RETIRED = [...RETIRED_THREAD_CHANNEL_TYPES, 'dashboard_agent'];

const COLUMNS = [
  ['threads', 'channel_type'],
  ['integrations', 'platform'],
  ['integration_disconnects', 'platform'],
  ['request_episode_outcomes', 'channel_type'],
  ['agent_requests', 'channel'],
];

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
let blockingRows = 0;
for (const [table, column] of COLUMNS) {
  if (!presentTables.has(table)) {
    retiredValueRows[`${table}.${column}`] = 'table absent';
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
  for (const row of rows) blockingRows += row.count;
}

const enumValues = (
  await db.$queryRawUnsafe(
    `SELECT e.enumlabel AS value FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'ChannelType' ORDER BY e.enumsortorder`,
  )
).map((r) => r.value);

const report = {
  generatedAt: new Date().toISOString(),
  enumValues,
  retiredValueRows,
  blockingRows,
  safe: blockingRows === 0 && !RETIRED.some((v) => enumValues.includes(v)),
};

console.log(JSON.stringify(report, null, 2));

if (strict && !report.safe) {
  process.exitCode = 1;
}

await db.$disconnect();
