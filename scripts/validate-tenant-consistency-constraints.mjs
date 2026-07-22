#!/usr/bin/env node
// P5-03 tenant-consistency constraint validation (CONTROLLED; mutating under --execute).
//
// Migration 20260720010000_add_tenant_consistency_constraints installs 14
// compound foreign keys NOT VALID. They already protect new writes, but Postgres
// has not checked historical rows, so it will not trust each constraint over the
// full table. This step runs VALIDATE CONSTRAINT to close that gap.
//
// This is deliberately a script, not the "later migration" that migration's
// comment anticipated. Prisma wraps a migration file in one transaction, so a
// migration would validate all 14 constraints all-or-nothing under a single
// SHARE UPDATE EXCLUSIVE hold, on every `migrate deploy`. Running each VALIDATE
// as its own autocommitted statement is what actually delivers the plan's
// "validate separately / keep each constraint independently removable / a later
// controlled step": one constraint can be validated, skipped, or fail without
// touching the others, and the step runs when an operator chooses.
//
// Inspect-only by default. --execute runs VALIDATE. Execution refuses unless the
// tenant-consistency audit is clean (a dirty audit means at least one VALIDATE
// would error mid-run) and every constraint is installed. Already-validated
// constraints are skipped, so re-running --execute is a safe no-op.
//
//   node scripts/with-test-env.mjs node scripts/validate-tenant-consistency-constraints.mjs
//   node scripts/with-test-env.mjs node scripts/validate-tenant-consistency-constraints.mjs --execute
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db, computeTenantConsistencyReport } = await import('@shopkeeper/db');

const EXECUTE = process.argv.slice(2).includes('--execute');

// (table, constraint) pairs mirror migration 20260720010000 exactly.
const CONSTRAINTS = [
  ['threads', 'threads_tenant_customer_fkey'],
  ['threads', 'threads_tenant_reply_integration_fkey'],
  ['threads', 'threads_tenant_cached_plan_message_fkey'],
  ['messages', 'messages_tenant_thread_fkey'],
  ['messages', 'messages_tenant_integration_fkey'],
  ['agent_actions', 'agent_actions_tenant_thread_fkey'],
  ['agent_actions', 'agent_actions_tenant_customer_fkey'],
  ['agent_actions', 'agent_actions_tenant_execution_fkey'],
  ['plan_executions', 'plan_executions_tenant_thread_fkey'],
  ['plan_executions', 'plan_executions_tenant_source_message_fkey'],
  ['plan_executions', 'plan_executions_tenant_source_message_thread_fkey'],
  ['kb_articles', 'kb_articles_tenant_knowledge_base_fkey'],
  ['kb_citations', 'kb_citations_tenant_article_fkey'],
  ['kb_citations', 'kb_citations_tenant_thread_fkey'],
];

async function readValidatedState() {
  const rows = await db.$queryRawUnsafe(
    `SELECT conname::text AS name, convalidated AS validated
     FROM pg_constraint WHERE contype = 'f'`,
  );
  return new Map(rows.map((row) => [row.name, Boolean(row.validated)]));
}

async function validateConstraint(table, constraint) {
  const startedAt = Date.now();
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "${table}" VALIDATE CONSTRAINT "${constraint}"`);
    return { table, constraint, outcome: 'validated', durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      table,
      constraint,
      outcome: 'failed',
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const audit = await computeTenantConsistencyReport(db);
const validatedState = await readValidatedState();

const constraints = CONSTRAINTS.map(([table, constraint]) => {
  const validated = validatedState.get(constraint);
  const state = validated === undefined ? 'missing' : validated ? 'already_validated' : 'pending';
  return { table, constraint, state };
});

const missing = constraints.filter((entry) => entry.state === 'missing');
const pending = constraints.filter((entry) => entry.state === 'pending');

const report = {
  mode: EXECUTE ? 'execute' : 'inspect',
  audit: { safeToConstrain: audit.safeToConstrain, totalMismatches: audit.totalMismatches },
  constraints,
  actions: [],
  notes: [],
};

if (missing.length > 0) {
  report.notes.push(
    `${missing.length} constraint(s) are not installed. Deploy migration ` +
      '20260720010000_add_tenant_consistency_constraints before validating.',
  );
}
if (!audit.safeToConstrain) {
  report.notes.push(
    `Tenant-consistency audit found ${audit.totalMismatches} mismatch(es); repair them before validating. ` +
      'Run npm run audit:tenant-consistency -- --strict for the detailed report.',
  );
}

if (EXECUTE) {
  if (!audit.safeToConstrain || missing.length > 0) {
    report.notes.push('No constraints were validated.');
    process.exitCode = 1;
  } else {
    for (const entry of pending) {
      report.actions.push(await validateConstraint(entry.table, entry.constraint));
    }
    const skipped = constraints.length - pending.length;
    if (skipped > 0) report.notes.push(`${skipped} constraint(s) were already validated and left untouched.`);
    if (pending.length === 0) report.notes.push('All constraints were already validated; nothing to do.');
  }
} else if (pending.length > 0) {
  report.notes.push(`${pending.length} constraint(s) are installed but not validated. Re-run with --execute.`);
} else if (missing.length === 0) {
  report.notes.push('All constraints are installed and validated.');
}

console.log(JSON.stringify(report, null, 2));

if (report.actions.some((action) => action.outcome === 'failed')) {
  process.exitCode = 1;
}

await db.$disconnect();
