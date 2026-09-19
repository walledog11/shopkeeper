// Conversational-agent overhaul Package 0 persisted-state inventory (READ-ONLY).
//
// Reports aggregate compatibility, recovery, delivery, grant, and usage evidence.
// It does not invoke recovery, providers, model calls, canaries, or cleanup.
//
//   npm run audit:conversational-overhaul-p0
//   npm run audit:conversational-overhaul-p0 -- --days=14 --stuck-minutes=10
//   SHOPKEEPER_DB_TARGET=prod npm run audit:conversational-overhaul-p0 -- --days=14
import { loadLocalEnv } from './load-local-env.mjs';
import {
  completeUtcWindow,
  pendingPlanReferences,
  summarizeCachedPlans,
  summarizePendingPlans,
  summarizePendingExecutions,
  summarizeShopifyIntegrations,
  summarizeTurnSamples,
  validUuidValues,
} from './conversational-overhaul-p0-inventory-lib.mjs';

loadLocalEnv();

const [{ db, Prisma }, { AGENT_PLAN_CACHE_VERSION }] = await Promise.all([
  import('@shopkeeper/db'),
  import('@shopkeeper/agent/plan-cache-shape'),
]);

function parsePositiveIntegerArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

function counts(rows, key) {
  return Object.fromEntries(rows.map((row) => [row[key] ?? 'unset', row._count._all]));
}

function range(aggregate, field) {
  const oldest = aggregate._min[field];
  const newest = aggregate._max[field];
  return {
    oldestAt: oldest?.toISOString() ?? null,
    newestAt: newest?.toISOString() ?? null,
  };
}

function jsonDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function environmentLabel() {
  if (process.env.SHOPKEEPER_DB_TARGET === 'prod') {
    return 'production (explicit SHOPKEEPER_DB_TARGET=prod)';
  }
  if (process.env.NODE_ENV === 'test') return 'local test database';
  return 'configured non-production database';
}

const days = parsePositiveIntegerArg('days', 14);
const stuckMinutes = parsePositiveIntegerArg('stuck-minutes', 10);
const generatedAt = new Date();
const { since, end } = completeUtcWindow(days, generatedAt);
const staleBefore = new Date(generatedAt.getTime() - stuckMinutes * 60 * 1000);

try {
  const [
    cachedThreads,
    operatorContexts,
    planStatuses,
    planModes,
    planRange,
    staleClaimedExecutions,
    pendingExecutionRows,
    actionTools,
    actionStatuses,
    actionModes,
    actionRange,
    unresolvedActionCount,
    unresolvedActionRange,
    actionsLinkedToUnknownExecutionCount,
    nullActionExecutionCount,
    nullActionOperationCount,
    duplicateOperationKeys,
    reservationStatuses,
    reservationRange,
    unresolvedReservationCount,
    unresolvedReservationRange,
    staleReservedReservationCount,
    deliveryGroups,
    unresolvedDeliveryGroups,
    turnUsage,
    turnUsageRange,
    turnUsageSamples,
    shopifyIntegrations,
  ] = await Promise.all([
    db.thread.findMany({
      where: { cachedPlan: { not: Prisma.DbNull } },
      select: { id: true, organizationId: true, cachedPlan: true, cachedPlanMessageId: true },
    }),
    db.operatorContext.findMany({
      where: { pendingPlans: { not: Prisma.DbNull } },
      select: { organizationId: true, pendingPlans: true },
    }),
    db.planExecution.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    db.planExecution.groupBy({ by: ['mode'], _count: { _all: true }, orderBy: { mode: 'asc' } }),
    db.planExecution.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } }),
    db.planExecution.count({ where: { status: 'claimed', claimedAt: { lt: staleBefore } } }),
    db.planExecution.findMany({
      where: { status: 'pending' },
      select: {
        planId: true,
        sourceMessageId: true,
        thread: { select: { cachedPlan: true, cachedPlanMessageId: true } },
      },
    }),
    db.agentAction.groupBy({
      by: ['tool'],
      where: { executedAt: { gte: since, lt: end } },
      _count: { _all: true },
      orderBy: { tool: 'asc' },
    }),
    db.agentAction.groupBy({
      by: ['status'],
      where: { executedAt: { gte: since, lt: end } },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    }),
    db.agentAction.groupBy({
      by: ['mode'],
      where: { executedAt: { gte: since, lt: end } },
      _count: { _all: true },
      orderBy: { mode: 'asc' },
    }),
    db.agentAction.aggregate({
      where: { executedAt: { gte: since, lt: end } },
      _min: { executedAt: true },
      _max: { executedAt: true },
    }),
    db.agentAction.count({ where: { status: 'unknown' } }),
    db.agentAction.aggregate({
      where: { status: 'unknown' },
      _min: { executedAt: true },
      _max: { executedAt: true },
    }),
    db.agentAction.count({ where: { execution: { status: 'unknown' } } }),
    db.agentAction.count({ where: { executionId: null } }),
    db.agentAction.count({ where: { providerOperationKey: null } }),
    db.$queryRaw`
      SELECT COUNT(*)::int AS "groupCount",
             COALESCE(SUM(duplicates."rowCount"), 0)::int AS "rowCount"
      FROM (
        SELECT COUNT(*)::int AS "rowCount"
        FROM agent_actions
        WHERE provider_operation_key IS NOT NULL
        GROUP BY organization_id, provider_operation_key
        HAVING COUNT(*) > 1
      ) AS duplicates
    `,
    db.refundSpendReservation.groupBy({
      by: ['status'],
      _count: { _all: true },
      orderBy: { status: 'asc' },
    }),
    db.refundSpendReservation.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } }),
    db.refundSpendReservation.count({ where: { status: { in: ['reserved', 'unknown'] } } }),
    db.refundSpendReservation.aggregate({
      where: { status: { in: ['reserved', 'unknown'] } },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    db.refundSpendReservation.count({
      where: { status: 'reserved', updatedAt: { lt: staleBefore } },
    }),
    db.$queryRaw`
      SELECT threads.channel_type::text AS channel,
             COALESCE(messages.send_status, 'unset') AS status,
             COUNT(*)::int AS count,
             MIN(messages.sent_at) AS "oldestAt",
             MAX(messages.sent_at) AS "newestAt"
      FROM messages
      JOIN threads ON threads.id = messages.thread_id
                   AND threads.organization_id = messages.organization_id
      WHERE messages.sender_type = 'agent'
        AND messages.send_status IS NOT NULL
        AND messages.sent_at >= ${since}
        AND messages.sent_at < ${end}
      GROUP BY threads.channel_type, messages.send_status
      ORDER BY threads.channel_type, messages.send_status
    `,
    db.$queryRaw`
      SELECT threads.channel_type::text AS channel,
             messages.send_status AS status,
             COUNT(*)::int AS count,
             MIN(messages.sent_at) AS "oldestAt",
             MAX(messages.sent_at) AS "newestAt"
      FROM messages
      JOIN threads ON threads.id = messages.thread_id
                   AND threads.organization_id = messages.organization_id
      WHERE messages.sender_type = 'agent'
        AND messages.send_status IN ('pending', 'processing', 'failed', 'unknown')
      GROUP BY threads.channel_type, messages.send_status
      ORDER BY threads.channel_type, messages.send_status
    `,
    db.agentTurnUsage.groupBy({
      by: ['outcome'],
      where: { createdAt: { gte: since, lt: end } },
      _count: { _all: true },
      _sum: { modelCalls: true, totalTokens: true, durationMs: true },
      orderBy: { outcome: 'asc' },
    }),
    db.agentTurnUsage.aggregate({
      where: { createdAt: { gte: since, lt: end } },
      _min: { createdAt: true },
      _max: { createdAt: true },
      _count: { _all: true },
      _sum: { modelCalls: true, totalTokens: true, durationMs: true },
    }),
    db.agentTurnUsage.findMany({
      where: { createdAt: { gte: since, lt: end } },
      select: { outcome: true, modelCalls: true, totalTokens: true, durationMs: true },
    }),
    db.integration.findMany({
      where: { platform: 'shopify' },
      select: { lifecycleStatus: true, metadata: true },
    }),
  ]);

  const cachedThreadIds = cachedThreads.map((thread) => thread.id);
  const latestMessages = cachedThreadIds.length === 0 ? [] : await db.message.findMany({
    where: {
      threadId: { in: cachedThreadIds },
      senderType: { not: 'note' },
      deletedAt: null,
    },
    select: { id: true, threadId: true },
    orderBy: [{ threadId: 'asc' }, { sentAt: 'desc' }],
    distinct: ['threadId'],
  });
  const latestMessageByThread = new Map(latestMessages.map((message) => [message.threadId, message.id]));
  const cachedPlanRows = cachedThreads.map((thread) => ({
    ...thread,
    latestConversationMessageId: latestMessageByThread.get(thread.id) ?? null,
  }));

  const pendingReferences = pendingPlanReferences(operatorContexts);
  const pendingThreadIds = validUuidValues(pendingReferences.map((reference) => reference.threadId));
  const pendingPlanIds = validUuidValues(pendingReferences.map((reference) => reference.planId));
  const [pendingThreads, pendingExecutions] = await Promise.all([
    pendingThreadIds.length === 0 ? [] : db.thread.findMany({
      where: { id: { in: pendingThreadIds } },
      select: { id: true, organizationId: true, cachedPlan: true, cachedPlanMessageId: true },
    }),
    pendingPlanIds.length === 0 ? [] : db.planExecution.findMany({
      where: { planId: { in: pendingPlanIds } },
      select: { organizationId: true, planId: true, status: true },
    }),
  ]);
  const pendingThreadByIdentity = new Map(pendingThreads.map((thread) => [
    `${thread.organizationId}:${thread.id}`,
    thread,
  ]));
  const pendingExecutionByIdentity = new Map(pendingExecutions.map((execution) => [
    `${execution.organizationId}:${execution.planId}`,
    execution,
  ]));

  const duplicateSummary = duplicateOperationKeys[0] ?? { groupCount: 0, rowCount: 0 };
  const delivery = deliveryGroups.map((row) => ({
    channel: row.channel,
    status: row.status,
    count: row.count,
    oldestAt: jsonDate(row.oldestAt),
    newestAt: jsonDate(row.newestAt),
  }));
  const unresolvedDelivery = unresolvedDeliveryGroups.map((row) => ({
    channel: row.channel,
    status: row.status,
    count: row.count,
    oldestAt: jsonDate(row.oldestAt),
    newestAt: jsonDate(row.newestAt),
  }));

  const report = {
    generatedAt: generatedAt.toISOString(),
    privacy: 'Aggregate counts only; no organization, customer, thread, message, plan, operation, or provider identifiers and no message bodies or provider payloads.',
    executionSafety: 'Read-only database queries only; no recovery, provider calls, model calls, canaries, or cleanup.',
    environment: environmentLabel(),
    window: {
      kind: 'most recent complete UTC days',
      days,
      since: since.toISOString(),
      endExclusive: end.toISOString(),
      stuckMinutes,
    },
    cachedPlans: summarizeCachedPlans(cachedPlanRows, AGENT_PLAN_CACHE_VERSION),
    pendingPlans: summarizePendingPlans(
      operatorContexts,
      pendingThreadByIdentity,
      pendingExecutionByIdentity,
      AGENT_PLAN_CACHE_VERSION,
    ),
    planExecutions: {
      byStatus: counts(planStatuses, 'status'),
      byMode: counts(planModes, 'mode'),
      ...range(planRange, 'createdAt'),
      staleClaimedCount: staleClaimedExecutions,
      pendingOwnership: summarizePendingExecutions(pendingExecutionRows, AGENT_PLAN_CACHE_VERSION),
    },
    agentActions: {
      window: {
        byTool: counts(actionTools, 'tool'),
        byStatus: counts(actionStatuses, 'status'),
        byMode: counts(actionModes, 'mode'),
        ...range(actionRange, 'executedAt'),
      },
      unresolved: {
        count: unresolvedActionCount,
        linkedToUnknownExecutionCount: actionsLinkedToUnknownExecutionCount,
        ...range(unresolvedActionRange, 'executedAt'),
      },
      compatibility: {
        nullExecutionIdCount: nullActionExecutionCount,
        nullProviderOperationKeyCount: nullActionOperationCount,
        duplicateProviderOperationKeys: duplicateSummary,
      },
    },
    refundSpendReservations: {
      byStatus: counts(reservationStatuses, 'status'),
      ...range(reservationRange, 'createdAt'),
      unresolved: {
        count: unresolvedReservationCount,
        staleReservedCount: staleReservedReservationCount,
        ...range(unresolvedReservationRange, 'createdAt'),
      },
    },
    responseDelivery: {
      window: delivery,
      unresolvedAllTime: unresolvedDelivery,
    },
    agentTurnUsage: {
      count: turnUsageRange._count._all,
      modelCalls: turnUsageRange._sum.modelCalls ?? 0,
      totalTokens: turnUsageRange._sum.totalTokens ?? 0,
      durationMs: turnUsageRange._sum.durationMs ?? 0,
      ...range(turnUsageRange, 'createdAt'),
      byOutcome: turnUsage.map((row) => ({
        outcome: row.outcome,
        count: row._count._all,
        modelCalls: row._sum.modelCalls ?? 0,
        totalTokens: row._sum.totalTokens ?? 0,
        durationMs: row._sum.durationMs ?? 0,
      })),
      completedTurnProxy: summarizeTurnSamples(turnUsageSamples),
      limitation: 'Legacy AgentTurnUsage is turn-scoped, so this does not yet establish cost or latency per completed multi-turn task.',
    },
    shopifyGrants: summarizeShopifyIntegrations(shopifyIntegrations),
    limitations: [
      'Operator module tools that do not write AgentAction rows are absent from capability usage counts.',
      'Current registry requiredScopes metadata is incomplete, so grant scope sets are reported without claiming per-capability eligibility.',
      'Delivery states are reported only where Message.sendStatus is populated; provider-specific acceptance semantics remain separate.',
      'Pending-plan identity checks do not recompute plan or instruction hashes and therefore do not certify executability.',
    ],
  };

  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.$disconnect();
}
