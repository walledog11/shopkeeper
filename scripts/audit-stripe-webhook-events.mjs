// P4-02 durable Stripe webhook rollout gate (READ-ONLY).
//
// Reports processing throughput and recovery states without emitting raw Stripe
// customer, subscription, or event identifiers.
//
//   npm run audit:stripe-webhooks
//   npm run audit:stripe-webhooks -- --hours=24 --strict
//   npm run audit:stripe-webhooks -- --hours=1 --strict --require-completed
import { createHash } from 'node:crypto';
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

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function sanitizeError(value) {
  if (typeof value !== 'string') return null;
  return value
    .replace(/(?:cus|sub|evt|in)_[A-Za-z0-9_-]+/g, '[redacted-stripe-id]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .slice(0, 1000);
}

function reviewRow(row) {
  return {
    eventFingerprint: fingerprint(row.id),
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    stripeCreatedAt: row.stripeCreatedAt,
    claimedAt: row.claimedAt,
    processedAt: row.processedAt,
    lastError: sanitizeError(row.lastError),
  };
}

const hours = parsePositiveNumberArg('hours', 24);
const stuckMinutes = parsePositiveNumberArg('stuck-minutes', 10);
const strict = process.argv.includes('--strict');
const requireCompleted = process.argv.includes('--require-completed');
const since = new Date(Date.now() - hours * 60 * 60 * 1000);
const stuckBefore = new Date(Date.now() - stuckMinutes * 60 * 1000);
const windowWhere = { createdAt: { gte: since } };
const reviewSelect = {
  id: true,
  type: true,
  status: true,
  attempts: true,
  stripeCreatedAt: true,
  claimedAt: true,
  processedAt: true,
  lastError: true,
};

try {
  const [total, statuses, types, failed, stalePending, staleProcessing, recovered] = await Promise.all([
    db.stripeWebhookEvent.count({ where: windowWhere }),
    db.stripeWebhookEvent.groupBy({
      by: ['status'],
      where: windowWhere,
      _count: { _all: true },
      orderBy: { status: 'asc' },
    }),
    db.stripeWebhookEvent.groupBy({
      by: ['type', 'status'],
      where: windowWhere,
      _count: { _all: true },
      orderBy: [{ type: 'asc' }, { status: 'asc' }],
    }),
    db.stripeWebhookEvent.findMany({
      where: { ...windowWhere, status: 'failed' },
      select: reviewSelect,
      orderBy: { updatedAt: 'asc' },
      take: 50,
    }),
    db.stripeWebhookEvent.findMany({
      where: { ...windowWhere, status: 'pending', createdAt: { gte: since, lt: stuckBefore } },
      select: reviewSelect,
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
    db.stripeWebhookEvent.findMany({
      where: { ...windowWhere, status: 'processing', claimedAt: { lt: stuckBefore } },
      select: reviewSelect,
      orderBy: { claimedAt: 'asc' },
      take: 50,
    }),
    db.stripeWebhookEvent.count({
      where: { ...windowWhere, status: 'completed', attempts: { gt: 1 } },
    }),
  ]);

  const byTypeAndStatus = {};
  for (const row of types) {
    byTypeAndStatus[row.type] ??= {};
    byTypeAndStatus[row.type][row.status] = row._count._all;
  }

  const blockers = {
    failedEvents: failed.map(reviewRow),
    stalePendingEvents: stalePending.map(reviewRow),
    staleProcessingEvents: staleProcessing.map(reviewRow),
  };
  const byStatus = Object.fromEntries(statuses.map((row) => [row.status, row._count._all]));
  const requiredCompletedMissing = requireCompleted && (byStatus.completed ?? 0) === 0;

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    window: { hours, since: since.toISOString(), stuckMinutes },
    total,
    byStatus,
    byTypeAndStatus,
    recoveredAfterRetry: recovered,
    requireCompleted,
    requiredCompletedMissing,
    blockers,
  }, null, 2));

  const hasBlockers = Object.values(blockers).some((rows) => rows.length > 0);
  if (strict && (hasBlockers || requiredCompletedMissing)) {
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
