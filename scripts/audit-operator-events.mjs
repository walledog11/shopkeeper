// P4-03 durable operator-event rollout gate (READ-ONLY).
//
// Reports event throughput and every state that requires recovery review. It
// deliberately omits merchant message/reply bodies and provider/chat IDs.
//
//   npm run audit:operator-events
//   npm run audit:operator-events -- --hours=24 --strict
//   npm run audit:operator-events -- --hours=1 --strict --require-channel=telegram
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

function parseRequiredChannel() {
  const prefix = '--require-channel=';
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (value === undefined) return null;
  if (value !== 'telegram' && value !== 'imessage') {
    throw new Error('--require-channel must be telegram or imessage');
  }
  return value;
}

const hours = parsePositiveNumberArg('hours', 24);
const stuckMinutes = parsePositiveNumberArg('stuck-minutes', 30);
const strict = process.argv.includes('--strict');
const requiredChannel = parseRequiredChannel();
const since = new Date(Date.now() - hours * 60 * 60 * 1000);
const stuckBefore = new Date(Date.now() - stuckMinutes * 60 * 1000);
const windowWhere = { createdAt: { gte: since } };
const reviewSelect = {
  id: true,
  organizationId: true,
  channel: true,
  status: true,
  attempts: true,
  claimedAt: true,
  processedAt: true,
  replyDeliveredAt: true,
  lastError: true,
  createdAt: true,
};

try {
  const [
    total,
    statuses,
    channels,
    attempts,
    deliveredChannels,
    failed,
    unknown,
    stalePending,
    staleClaims,
    undelivered,
    repeatedClaims,
  ] =
    await Promise.all([
      db.operatorEvent.count({ where: windowWhere }),
      db.operatorEvent.groupBy({
        by: ['status'],
        where: windowWhere,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      db.operatorEvent.groupBy({
        by: ['channel'],
        where: windowWhere,
        _count: { _all: true },
        orderBy: { channel: 'asc' },
      }),
      db.operatorEvent.groupBy({
        by: ['attempts'],
        where: windowWhere,
        _count: { _all: true },
        orderBy: { attempts: 'asc' },
      }),
      db.operatorEvent.groupBy({
        by: ['channel'],
        where: {
          ...windowWhere,
          status: 'committed',
          replyDeliveredAt: { not: null },
        },
        _count: { _all: true },
        orderBy: { channel: 'asc' },
      }),
      db.operatorEvent.findMany({
        where: { ...windowWhere, status: 'failed' },
        select: reviewSelect,
        orderBy: { processedAt: 'asc' },
        take: 50,
      }),
      db.operatorEvent.findMany({
        where: { ...windowWhere, status: 'unknown' },
        select: reviewSelect,
        orderBy: { processedAt: 'asc' },
        take: 50,
      }),
      db.operatorEvent.findMany({
        where: { status: 'pending', createdAt: { gte: since, lt: stuckBefore } },
        select: reviewSelect,
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
      db.operatorEvent.findMany({
        where: { ...windowWhere, status: 'claimed', claimedAt: { lt: stuckBefore } },
        select: reviewSelect,
        orderBy: { claimedAt: 'asc' },
        take: 50,
      }),
      db.operatorEvent.findMany({
        where: {
          ...windowWhere,
          status: 'committed',
          processedAt: { lt: stuckBefore },
          replyText: { not: null },
          replyDeliveredAt: null,
        },
        select: reviewSelect,
        orderBy: { processedAt: 'asc' },
        take: 50,
      }),
      db.operatorEvent.findMany({
        where: { ...windowWhere, attempts: { gt: 1 } },
        select: reviewSelect,
        orderBy: { attempts: 'desc' },
        take: 50,
      }),
    ]);

  const reviewEvents = [...failed, ...unknown];
  const reviewIds = [...new Set(reviewEvents.map((event) => event.id))];
  const actions = reviewIds.length === 0
    ? []
    : await db.agentAction.findMany({
        where: { turnId: { in: reviewIds } },
        select: {
          turnId: true,
          organizationId: true,
          tool: true,
          category: true,
          status: true,
          executedAt: true,
        },
        orderBy: { executedAt: 'asc' },
      });

  const byChannel = Object.fromEntries(channels.map((row) => [row.channel, row._count._all]));
  const deliveredRepliesByChannel = Object.fromEntries(
    deliveredChannels.map((row) => [row.channel, row._count._all]),
  );
  const requiredChannelMissing = requiredChannel !== null && (byChannel[requiredChannel] ?? 0) === 0;
  const requiredChannelDeliveredReplyMissing =
    requiredChannel !== null && (deliveredRepliesByChannel[requiredChannel] ?? 0) === 0;
  const blockers = {
    failedEvents: failed,
    unknownEvents: unknown,
    stalePendingEvents: stalePending,
    staleClaims,
    committedUndelivered: undelivered,
    repeatedClaims,
  };

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    window: { hours, since: since.toISOString(), stuckMinutes },
    total,
    byStatus: Object.fromEntries(statuses.map((row) => [row.status, row._count._all])),
    byChannel,
    byAttempts: Object.fromEntries(attempts.map((row) => [row.attempts, row._count._all])),
    deliveredRepliesByChannel,
    requiredChannel,
    requiredChannelMissing,
    requiredChannelDeliveredReplyMissing,
    blockers,
    actionsForFailedOrUnknownEvents: actions,
  }, null, 2));

  const hasBlockers = Object.values(blockers).some((rows) => rows.length > 0);
  if (
    strict
    && (hasBlockers || requiredChannelMissing || requiredChannelDeliveredReplyMissing)
  ) {
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
