// Data gate for 20260912160000_add_agent_action_dispatch_lifecycle (READ-ONLY).
//
// That migration adds a unique index on ("organization_id", "provider_operation_key")
// and, before creating it, raises deliberately so the deploy names the offending
// keys rather than failing on index creation:
//
//   ERROR: duplicate organization/provider operation keys prevent dispatch
//          lifecycle migration
//
// It is the only data-dependent abort in the pending queue. Every other constraint
// those migrations add is on a column added nullable in the same migration, so
// existing rows short-circuit the CHECK; this one reads a pre-existing column with
// live rows. Run it before `migrate deploy` on any database carrying agent_actions
// history — a schema-only replay cannot surface it.
//
//   npm run audit:agent-action-operation-keys
//   npm run audit:agent-action-operation-keys -- --strict
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');

const strict = process.argv.includes('--strict');

const duplicates = await db.$queryRawUnsafe(
  `SELECT "organization_id"::text AS "organizationId",
          "provider_operation_key" AS "providerOperationKey",
          COUNT(*)::int AS count
     FROM "agent_actions"
    WHERE "provider_operation_key" IS NOT NULL
    GROUP BY 1, 2
   HAVING COUNT(*) > 1
    ORDER BY 3 DESC, 2
    LIMIT 50`,
);

const [{ total }] = await db.$queryRawUnsafe(
  `SELECT COUNT(*)::int AS total FROM "agent_actions"`,
);

const report = {
  generatedAt: new Date().toISOString(),
  agentActionRows: total,
  duplicateOperationKeys: duplicates,
  safeToRunDispatchLifecycleMigration: duplicates.length === 0,
};

console.log(JSON.stringify(report, null, 2));

if (strict && !report.safeToRunDispatchLifecycleMigration) {
  process.exitCode = 1;
}

await db.$disconnect();
