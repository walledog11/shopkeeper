// Milestone 3 request-episode outcome report (READ-ONLY).
//
// Prints the phase-a resolution table: volume and outcome counts by request tag
// for one org or every org with rows in the window. Organization identifiers are
// fingerprinted unless --org is passed for a deliberate drill-down.
//
//   npm run audit:request-outcomes
//   npm run audit:request-outcomes -- --days=7
//   npm run audit:request-outcomes -- --org=<uuid>
//   SHOPKEEPER_DB_TARGET=prod npm run audit:request-outcomes -- --days=30
import { createHash } from 'node:crypto';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePositiveNumberArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return value;
}

function parseOrgArg() {
  const prefix = '--org=';
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return null;
  if (!UUID_RE.test(raw)) {
    throw new Error('--org must be a UUID');
  }
  return raw;
}

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function emptyTotals() {
  return {
    volume: 0,
    autoResolved: 0,
    merchantApproved: 0,
    merchantInput: 0,
    escalated: 0,
    failed: 0,
    invalidPlan: 0,
    namespaceMiss: 0,
  };
}

function addTotals(target, row) {
  target.volume += row.volume;
  target.autoResolved += row.autoResolved;
  target.merchantApproved += row.merchantApproved;
  target.merchantInput += row.merchantInput;
  target.escalated += row.escalated;
  target.failed += row.failed;
  target.invalidPlan += row.invalidPlan;
  target.namespaceMiss += row.namespaceMiss;
}

const days = parsePositiveNumberArg('days', 30);
const orgId = parseOrgArg();
const to = new Date();
const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const { db } = await import('@shopkeeper/db');
const { queryRequestOutcomeReport } = await import('@shopkeeper/agent/request-outcome-report');

try {
  const orgIds = orgId
    ? [orgId]
    : (await db.requestEpisodeOutcome.findMany({
      where: { createdAt: { gte: from, lte: to } },
      distinct: ['organizationId'],
      select: { organizationId: true },
      orderBy: { organizationId: 'asc' },
    })).map((row) => row.organizationId);

  const organizations = [];
  const grandTotals = emptyTotals();

  for (const id of orgIds) {
    const byRequestTag = await queryRequestOutcomeReport({ orgId: id, from, to });
    const totals = emptyTotals();
    for (const row of byRequestTag) addTotals(totals, row);
    addTotals(grandTotals, totals);

    organizations.push({
      organizationFingerprint: fingerprint(id),
      ...(orgId ? { organizationId: id } : {}),
      byRequestTag,
      totals,
    });
  }

  const report = {
    window: { days, from: from.toISOString(), to: to.toISOString() },
    organizationCount: organizations.length,
    organizations,
  };

  if (organizations.length > 1) {
    report.grandTotals = grandTotals;
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.$disconnect();
}
