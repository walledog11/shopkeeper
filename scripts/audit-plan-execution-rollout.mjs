import { db } from '@shopkeeper/db';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

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

const hours = parsePositiveNumberArg('hours', 24);
const stuckMinutes = parsePositiveNumberArg('stuck-minutes', 10);
const strict = process.argv.includes('--strict');
const since = new Date(Date.now() - hours * 60 * 60 * 1000);
const stuckBefore = new Date(Date.now() - stuckMinutes * 60 * 1000);

const [total, statuses, modes, repeated, unknown, stuck] = await Promise.all([
  db.planExecution.count({ where: { createdAt: { gte: since } } }),
  db.planExecution.groupBy({
    by: ['status'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { status: 'asc' },
  }),
  db.planExecution.groupBy({
    by: ['mode'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { mode: 'asc' },
  }),
  db.planExecution.findMany({
    where: { createdAt: { gte: since }, observationCount: { gt: 1 } },
    select: {
      id: true,
      organizationId: true,
      planId: true,
      observationCount: true,
      lastObservedAt: true,
    },
    orderBy: { observationCount: 'desc' },
    take: 20,
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
    take: 20,
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
    take: 20,
  }),
]);

const report = {
  window: { hours, since: since.toISOString(), stuckMinutes },
  total,
  byStatus: Object.fromEntries(statuses.map((row) => [row.status, row._count._all])),
  byMode: Object.fromEntries(modes.map((row) => [row.mode ?? 'unset', row._count._all])),
  repeatedShadowObservations: repeated,
  unknownOutcomes: unknown,
  staleClaims: stuck,
};

console.log(JSON.stringify(report, null, 2));

if (strict && (repeated.length > 0 || unknown.length > 0 || stuck.length > 0)) {
  process.exitCode = 1;
}

await db.$disconnect();
