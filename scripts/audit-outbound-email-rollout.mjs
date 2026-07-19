// P4-01 async outbound-email rollout gate (READ-ONLY).
//
// Reports delivery throughput and states that require recovery review. It
// deliberately omits message bodies, customer addresses, and raw provider IDs.
//
//   npm run audit:outbound-email
//   npm run audit:outbound-email -- --hours=24 --strict
//   npm run audit:outbound-email -- --hours=1 --strict --require-provider=gmail
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

function parseRequiredProvider() {
  const prefix = '--require-provider=';
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (value === undefined) return null;
  if (value !== 'gmail' && value !== 'postmark') {
    throw new Error('--require-provider must be gmail or postmark');
  }
  return value;
}

function readProvider(integration) {
  if (integration?.emailProvider === 'gmail' || integration?.emailProvider === 'postmark') {
    return integration.emailProvider;
  }
  const metadata = integration?.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    if (metadata.provider === 'gmail' || metadata.provider === 'postmark') {
      return metadata.provider;
    }
  }
  return 'postmark';
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

function sanitizeMessage(message, providerByIntegrationId) {
  return {
    id: message.id,
    organizationId: message.organizationId,
    threadId: message.threadId,
    integrationId: message.integrationId,
    provider: message.integrationId
      ? providerByIntegrationId.get(message.integrationId) ?? 'postmark'
      : 'unknown',
    status: message.sendStatus,
    sentAt: message.sentAt,
    sendClaimedAt: message.sendClaimedAt,
    sendAttemptedAt: message.sendAttemptedAt,
    hasProviderMessageId: message.providerMessageId !== null,
    sendError: sanitizeError(message.sendError),
  };
}

const hours = parsePositiveNumberArg('hours', 24);
const stuckMinutes = parsePositiveNumberArg('stuck-minutes', 10);
const strict = process.argv.includes('--strict');
const requiredProvider = parseRequiredProvider();
const since = new Date(Date.now() - hours * 60 * 60 * 1000);
const stuckBefore = new Date(Date.now() - stuckMinutes * 60 * 1000);
const windowWhere = {
  senderType: 'agent',
  sendStatus: { not: null },
  sentAt: { gte: since },
};
const reviewSelect = {
  id: true,
  organizationId: true,
  threadId: true,
  integrationId: true,
  sendStatus: true,
  sendClaimedAt: true,
  sendAttemptedAt: true,
  providerMessageId: true,
  sendError: true,
  sentAt: true,
};

try {
  const [total, statuses, integrationStatusGroups, failed, unknown, stalePending, staleProcessing, sentMissingProvider, sentRows] =
    await Promise.all([
      db.message.count({ where: windowWhere }),
      db.message.groupBy({
        by: ['sendStatus'],
        where: windowWhere,
        _count: { _all: true },
        orderBy: { sendStatus: 'asc' },
      }),
      db.message.groupBy({
        by: ['integrationId', 'sendStatus'],
        where: windowWhere,
        _count: { _all: true },
      }),
      db.message.findMany({
        where: { ...windowWhere, sendStatus: 'failed' },
        select: reviewSelect,
        orderBy: { sentAt: 'asc' },
        take: 50,
      }),
      db.message.findMany({
        where: { ...windowWhere, sendStatus: 'unknown' },
        select: reviewSelect,
        orderBy: { sentAt: 'asc' },
        take: 50,
      }),
      db.message.findMany({
        where: { ...windowWhere, sendStatus: 'pending', sentAt: { gte: since, lt: stuckBefore } },
        select: reviewSelect,
        orderBy: { sentAt: 'asc' },
        take: 50,
      }),
      db.message.findMany({
        where: {
          ...windowWhere,
          sendStatus: 'processing',
          sendClaimedAt: { lt: stuckBefore },
        },
        select: reviewSelect,
        orderBy: { sendClaimedAt: 'asc' },
        take: 50,
      }),
      db.message.findMany({
        where: { ...windowWhere, sendStatus: 'sent', providerMessageId: null },
        select: reviewSelect,
        orderBy: { sentAt: 'asc' },
        take: 50,
      }),
      db.message.findMany({
        where: { ...windowWhere, sendStatus: 'sent', providerMessageId: { not: null } },
        select: reviewSelect,
        orderBy: { sentAt: 'asc' },
      }),
    ]);

  const integrationIds = [...new Set(
    integrationStatusGroups.map((row) => row.integrationId).filter((id) => id !== null),
  )];
  const integrations = integrationIds.length === 0
    ? []
    : await db.integration.findMany({
        where: { id: { in: integrationIds } },
        select: { id: true, emailProvider: true, metadata: true },
      });
  const providerByIntegrationId = new Map(
    integrations.map((integration) => [integration.id, readProvider(integration)]),
  );

  const byProviderAndStatus = {};
  for (const row of integrationStatusGroups) {
    const provider = row.integrationId
      ? providerByIntegrationId.get(row.integrationId) ?? 'postmark'
      : 'unknown';
    byProviderAndStatus[provider] ??= {};
    byProviderAndStatus[provider][row.sendStatus ?? 'unset'] =
      (byProviderAndStatus[provider][row.sendStatus ?? 'unset'] ?? 0) + row._count._all;
  }

  const sentByProviderId = new Map();
  for (const message of sentRows) {
    const key = `${message.organizationId}:${message.providerMessageId}`;
    const rows = sentByProviderId.get(key) ?? [];
    rows.push(message);
    sentByProviderId.set(key, rows);
  }
  const duplicateProviderIds = [...sentByProviderId.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      providerMessageFingerprint: fingerprint(key),
      messages: rows.map((message) => sanitizeMessage(message, providerByIntegrationId)),
    }));

  const blockers = {
    failedMessages: failed.map((message) => sanitizeMessage(message, providerByIntegrationId)),
    unknownMessages: unknown.map((message) => sanitizeMessage(message, providerByIntegrationId)),
    stalePendingMessages: stalePending.map((message) => sanitizeMessage(message, providerByIntegrationId)),
    staleProcessingMessages: staleProcessing.map((message) => sanitizeMessage(message, providerByIntegrationId)),
    sentMissingProviderId: sentMissingProvider.map((message) => sanitizeMessage(message, providerByIntegrationId)),
    duplicateProviderIds,
  };
  const requiredProviderMissing = requiredProvider !== null
    && Object.values(byProviderAndStatus[requiredProvider] ?? {}).reduce((sum, count) => sum + count, 0) === 0;
  const requiredProviderSentMissing = requiredProvider !== null
    && (byProviderAndStatus[requiredProvider]?.sent ?? 0) === 0;

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    window: { hours, since: since.toISOString(), stuckMinutes },
    total,
    byStatus: Object.fromEntries(statuses.map((row) => [row.sendStatus ?? 'unset', row._count._all])),
    byProviderAndStatus,
    requiredProvider,
    requiredProviderMissing,
    requiredProviderSentMissing,
    blockers,
  }, null, 2));

  const hasBlockers = Object.values(blockers).some((rows) => rows.length > 0);
  if (strict && (hasBlockers || requiredProviderMissing || requiredProviderSentMissing)) {
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
