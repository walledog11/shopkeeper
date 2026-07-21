// P3-01/P3-02 unknown-outcome reconciliation rollout gate (READ-ONLY).
//
// Reports ambiguous plan executions and goodwill reservations that still need
// provider reconciliation. Omits customer content and raw provider payloads.
//
//   npm run audit:unknown-outcomes
//   npm run audit:unknown-outcomes -- --hours=24 --strict
import { createHash } from 'node:crypto';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');

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

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function sanitizeError(value) {
  if (typeof value !== 'string') return null;
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .slice(0, 1000);
}

const hours = parsePositiveNumberArg('hours', 24);
const stuckMinutes = parsePositiveNumberArg('stuck-minutes', 10);
const strict = process.argv.includes('--strict');
const since = new Date(Date.now() - hours * 60 * 60 * 1000);
const stuckBefore = new Date(Date.now() - stuckMinutes * 60 * 1000);

const [
  executionStatuses,
  unknownExecutions,
  staleClaims,
  reservationStatuses,
  unknownReservations,
  staleReservations,
] = await Promise.all([
  db.planExecution.groupBy({
    by: ['status'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { status: 'asc' },
  }),
  db.planExecution.findMany({
    where: { createdAt: { gte: since }, status: 'unknown' },
    select: {
      id: true,
      organizationId: true,
      planId: true,
      mode: true,
      completedAt: true,
      lastError: true,
    },
    orderBy: { completedAt: 'desc' },
    take: 50,
  }),
  db.planExecution.findMany({
    where: {
      createdAt: { gte: since },
      status: 'claimed',
      claimedAt: { lt: stuckBefore },
    },
    select: {
      id: true,
      organizationId: true,
      planId: true,
      mode: true,
      claimedAt: true,
    },
    orderBy: { claimedAt: 'asc' },
    take: 50,
  }),
  db.refundSpendReservation.groupBy({
    by: ['status'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { reservedCents: true, committedCents: true },
    orderBy: { status: 'asc' },
  }),
  db.refundSpendReservation.findMany({
    where: { createdAt: { gte: since }, status: 'unknown' },
    select: {
      id: true,
      organizationId: true,
      tool: true,
      reservedCents: true,
      updatedAt: true,
      lastError: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: 50,
  }),
  db.refundSpendReservation.findMany({
    where: {
      createdAt: { gte: since },
      status: 'reserved',
      updatedAt: { lt: stuckBefore },
    },
    select: {
      id: true,
      organizationId: true,
      tool: true,
      reservedCents: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: 50,
  }),
]);

const report = {
  window: { hours, since: since.toISOString(), stuckMinutes },
  planExecutions: {
    byStatus: Object.fromEntries(executionStatuses.map((row) => [row.status, row._count._all])),
    unknownOutcomes: unknownExecutions.map((row) => ({
      executionFingerprint: fingerprint(row.id),
      organizationFingerprint: fingerprint(row.organizationId),
      planFingerprint: fingerprint(row.planId),
      mode: row.mode,
      completedAt: row.completedAt,
      lastError: sanitizeError(row.lastError),
    })),
    staleClaims: staleClaims.map((row) => ({
      executionFingerprint: fingerprint(row.id),
      organizationFingerprint: fingerprint(row.organizationId),
      planFingerprint: fingerprint(row.planId),
      mode: row.mode,
      claimedAt: row.claimedAt,
    })),
  },
  refundSpendReservations: {
    byStatus: Object.fromEntries(reservationStatuses.map((row) => [
      row.status,
      {
        count: row._count._all,
        reservedCents: row._sum.reservedCents ?? 0,
        committedCents: row._sum.committedCents ?? 0,
      },
    ])),
    unknownOutcomes: unknownReservations.map((row) => ({
      reservationFingerprint: fingerprint(row.id),
      organizationFingerprint: fingerprint(row.organizationId),
      tool: row.tool,
      reservedCents: row.reservedCents,
      updatedAt: row.updatedAt,
      lastError: sanitizeError(row.lastError),
    })),
    staleReservations: staleReservations.map((row) => ({
      reservationFingerprint: fingerprint(row.id),
      organizationFingerprint: fingerprint(row.organizationId),
      tool: row.tool,
      reservedCents: row.reservedCents,
      updatedAt: row.updatedAt,
    })),
  },
};

console.log(JSON.stringify(report, null, 2));

const blockers = [
  ...unknownExecutions,
  ...staleClaims,
  ...unknownReservations,
  ...staleReservations,
];

if (strict && blockers.length > 0) {
  process.exitCode = 1;
}

await db.$disconnect();
