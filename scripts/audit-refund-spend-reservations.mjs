import { db } from '@shopkeeper/db';

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

const [total, statuses, unknown, stale] = await Promise.all([
  db.refundSpendReservation.count({ where: { createdAt: { gte: since } } }),
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
      operationKey: true,
      tool: true,
      reservedCents: true,
      lastError: true,
      updatedAt: true,
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
      operationKey: true,
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
  total,
  byStatus: Object.fromEntries(statuses.map((row) => [
    row.status,
    {
      count: row._count._all,
      reservedCents: row._sum.reservedCents ?? 0,
      committedCents: row._sum.committedCents ?? 0,
    },
  ])),
  unknownOutcomes: unknown,
  staleReservations: stale,
};

console.log(JSON.stringify(report, null, 2));

if (strict && (unknown.length > 0 || stale.length > 0)) {
  process.exitCode = 1;
}

await db.$disconnect();
