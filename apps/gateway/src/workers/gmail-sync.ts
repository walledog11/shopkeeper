import { Worker, type Job, type Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { db } from '@shopkeeper/db';
import {
  buildInboxWatchRequest,
  EmailNotConfiguredError,
  GmailApiClient,
  getEmailProvider,
  historyIdAtOrAfter,
  detectEmailBounce,
  isForSupportAddress,
  isGmailApiError,
  isValidGmailHistoryId,
  maxGmailHistoryId,
  metadataWithGmailState,
  normalizeInboundEmail,
  parseMime,
  readStoredGmailHistoryId,
} from '@shopkeeper/email';
import { getEmailInboundMode } from '../config/env.js';
import { isGmailNativeInboundEnabled } from '../config/runtime-config.js';
import { CHANNEL, JOB, QUEUE } from '../constants.js';
import {
  acquireGmailIntegrationLock,
  type GmailSyncRedis,
} from '../lib/gmail-sync-lock.js';
import { isRecord } from '../lib/typing.js';
import logger from '../logger.js';
import { recordEmailBounce } from '../message-handlers/email-bounce.js';
import { emitOpsAlert } from '../ops-alerts.js';
import { applyInboundAttachmentBudget } from '../storage/attachment-budget.js';
import type { GmailSyncJobData, InboundJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

const GMAIL_RECOVERY_MAX_RESULTS = 500;
const GMAIL_RECOVERY_MAX_MESSAGES = 2_000;
const GMAIL_RECOVERY_QUERY = 'newer_than:7d in:inbox';
const GMAIL_OPERATOR_RECOVERY_MAX_MESSAGES = 50_000;
const GMAIL_MESSAGE_FETCH_CONCURRENCY = 3;
const GMAIL_RETRY_BASE_MS = 5_000;
const GMAIL_RETRY_MAX_MS = 6 * 60 * 60 * 1_000;

interface GmailSyncIntegration {
  id: string;
  accessToken: string | null;
  externalAccountId: string;
  emailProvider: 'gmail' | 'postmark' | null;
  fromEmail: string | null;
  metadata: unknown;
  organizationId: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export interface GmailSyncProcessorDependencies {
  inboundQueue: Queue<InboundJobData>;
  redis: GmailSyncRedis;
  createClient?: (integration: GmailSyncIntegration) => GmailApiClient;
  emitAlert?: typeof emitOpsAlert;
  now?: () => Date;
  recoveryMaxMessages?: number;
}

export interface GmailSyncWorkerRegistrationOptions extends GmailSyncProcessorDependencies {
  workerOptions: SharedGatewayWorkerOptions;
}

function isNativeGmailInboundEnabled(
  integration: GmailSyncIntegration,
  allowIncompleteRecovery: boolean,
): boolean {
  if (!isGmailNativeInboundEnabled()) return false;
  if (getEmailInboundMode() === 'postmark') return false;
  if (getEmailProvider(integration) !== 'gmail' || !isRecord(integration.metadata)) return false;
  if (integration.metadata.inboundMode === 'postmark') return false;
  const inboundStatus = isRecord(integration.metadata.gmail)
    ? integration.metadata.gmail.inboundStatus
    : null;
  const lastError = isRecord(integration.metadata.gmail)
    ? integration.metadata.gmail.lastError
    : null;
  return inboundStatus === 'active'
    || (
      allowIncompleteRecovery
      && inboundStatus === 'degraded'
      && lastError === 'sync_recovery_truncated'
    );
}

function normalizeAddress(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function providerMessageKey(messageId: string): string {
  return `gmail:${messageId}`;
}

async function mapGmailMessagesWithConcurrency<T>(
  items: string[],
  run: (messageId: string) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(GMAIL_MESSAGE_FETCH_CONCURRENCY, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await run(items[index]);
      }
    },
  );
  const settled = await Promise.allSettled(workers);
  const failure = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) throw failure.reason;
  return results;
}

async function markReauthorizationRequired(integrationId: string): Promise<void> {
  const current = await db.integration.findUnique({
    where: { id: integrationId },
    select: { metadata: true },
  });
  if (!current) return;

  await db.integration.update({
    where: { id: integrationId },
    data: {
      tokenExpiresAt: new Date(0),
      metadata: metadataWithGmailState(current.metadata, {
        inboundStatus: 'reauthorization_required',
        lastError: 'sync_authentication',
      }) as Prisma.InputJsonObject,
    },
  });
}

async function advanceCheckpoint(
  integrationId: string,
  processedHistoryId: string,
  now: Date,
): Promise<void> {
  const current = await db.integration.findUnique({
    where: { id: integrationId },
    select: { metadata: true },
  });
  if (!current) return;

  const currentHistoryId = readStoredGmailHistoryId(current.metadata);
  const historyId = currentHistoryId
    ? maxGmailHistoryId(currentHistoryId, processedHistoryId)
    : processedHistoryId;

  await db.integration.update({
    where: { id: integrationId },
    data: {
      metadata: metadataWithGmailState(
        current.metadata,
        {
          historyId,
          lastSyncedAt: now.toISOString(),
        },
      ) as Prisma.InputJsonObject,
    },
  });
}

async function markRecoveryIncomplete(
  integrationId: string,
  now: Date,
): Promise<void> {
  const current = await db.integration.findUnique({
    where: { id: integrationId },
    select: { metadata: true },
  });
  if (!current) return;

  await db.integration.update({
    where: { id: integrationId },
    data: {
      metadata: metadataWithGmailState(current.metadata, {
        inboundStatus: 'degraded',
        lastError: 'sync_recovery_truncated',
        lastRecoveryAttemptAt: now.toISOString(),
      }) as Prisma.InputJsonObject,
    },
  });
}

async function establishRecoveredCheckpoint(
  integrationId: string,
  response: { expiration: string; historyId: string },
  now: Date,
): Promise<void> {
  const current = await db.integration.findUnique({
    where: { id: integrationId },
    select: { metadata: true },
  });
  if (!current) return;

  await db.integration.update({
    where: { id: integrationId },
    data: {
      metadata: metadataWithGmailState(
        current.metadata,
        {
          historyId: response.historyId,
          inboundStatus: 'active',
          lastSyncedAt: now.toISOString(),
          watchExpiration: response.expiration,
          watchFailureCount: 0,
          watchLastRenewedAt: now.toISOString(),
        },
        { clearLastError: true },
      ) as Prisma.InputJsonObject,
    },
  });
}

async function loadIntegration(integrationId: string): Promise<GmailSyncIntegration | null> {
  return db.integration.findUnique({
    where: { id: integrationId },
    select: {
      id: true,
      accessToken: true,
      externalAccountId: true,
      emailProvider: true,
      fromEmail: true,
      metadata: true,
      organizationId: true,
      refreshToken: true,
      tokenExpiresAt: true,
    },
  });
}

async function enqueueGmailMessages(
  integration: GmailSyncIntegration,
  messageIds: Iterable<string>,
  client: GmailApiClient,
  inboundQueue: Queue<InboundJobData>,
  traceId: string,
): Promise<number> {
  const merchantAddresses = new Set(
    [integration.externalAccountId, integration.fromEmail]
      .map(normalizeAddress)
      .filter((address): address is string => address !== null),
  );
  const supportAddress = integration.fromEmail || integration.externalAccountId;
  const results = await mapGmailMessagesWithConcurrency(
    [...messageIds],
    async (messageId): Promise<number> => {
      const message = await client.getMessageRaw(messageId);
      const labels = new Set(message.labelIds ?? []);
      if (!labels.has('INBOX') || labels.has('SENT')) return 0;

      // MIME parse failures are retryable by default. Only a successfully
      // parsed message that is explicitly unusable/filterable is skipped.
      let parsed;
      try {
        parsed = await parseMime(message.raw);
      } catch (error) {
        logger.warn(
          { gmailMessageId: message.id, integrationId: integration.id },
          '[Gmail Sync] MIME parse failed; retrying sync',
        );
        throw error;
      }
      // Gmail has no bounce webhook — a failed delivery comes back as mail from
      // the receiving system. Checked before the support-address filter, which a
      // daemon report addressed to the sending mailbox would otherwise drop.
      const bounce = detectEmailBounce(parsed);
      if (bounce) {
        const outcome = await recordEmailBounce({
          provider: 'gmail',
          locator: { kind: 'outbound_message_id', value: bounce.outboundMessageId },
          recipient: null,
          bounceType: bounce.permanent ? 'permanent' : 'transient',
          detail: bounce.detail,
          permanent: bounce.permanent,
        });
        logger.info(
          { gmailMessageId: message.id, integrationId: integration.id, outcome },
          '[Gmail Sync] Delivery status notification processed',
        );
        return 0;
      }

      if (parsed.from && merchantAddresses.has(parsed.from.toLowerCase())) return 0;
      if (!isForSupportAddress(parsed, supportAddress)) return 0;

      const normalized = normalizeInboundEmail(parsed);
      if (!normalized) {
        logger.warn(
          { gmailMessageId: message.id, integrationId: integration.id },
          '[Gmail Sync] Skipping non-actionable parsed message',
        );
        return 0;
      }
      const { accepted: attachments, rejected } = applyInboundAttachmentBudget(
        normalized.attachments,
      );
      if (rejected.length > 0) {
        logger.warn(
          {
            gmailMessageId: message.id,
            integrationId: integration.id,
            rejected: rejected.map(({ name, reason, bytes }) => ({ name, reason, bytes })),
          },
          '[Gmail Sync] Dropped inbound attachments over budget before queueing',
        );
      }

      const inboundMessageId = normalized.inboundMessageId || providerMessageKey(message.id);
      const internalDateMs = message.internalDate ? Number(message.internalDate) : Number.NaN;
      const receivedAt = Number.isFinite(internalDateMs) && internalDateMs >= 0
        ? new Date(internalDateMs).toISOString()
        : new Date().toISOString();
      await inboundQueue.add(
        JOB.EMAIL,
        {
          platform: CHANNEL.EMAIL,
          organizationId: integration.organizationId,
          integrationId: integration.id,
          receivedAt,
          senderEmail: normalized.senderEmail,
          senderName: normalized.senderName,
          subject: normalized.subject,
          body: normalized.body,
          inboundMessageId,
          traceId,
          ...(attachments.length > 0
            ? { attachments }
            : {}),
        },
        { jobId: `gmail-inbound-${integration.id}-${message.id}` },
      );
      return 1;
    },
  );

  return results.reduce((total, count) => total + count, 0);
}

async function listRecoveryMessageIds(
  client: GmailApiClient,
  maxMessages: number,
  query: string,
): Promise<{ messageIds: Set<string>; truncated: boolean }> {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;

  do {
    const remaining = maxMessages - messageIds.size;
    if (remaining <= 0) {
      return { messageIds, truncated: true };
    }
    const response = await client.listMessages({
      maxResults: Math.min(GMAIL_RECOVERY_MAX_RESULTS, remaining),
      ...(pageToken ? { pageToken } : {}),
      query,
      labelIds: ['INBOX'],
      includeSpamTrash: false,
    });
    for (const message of response.messages) messageIds.add(message.id);
    pageToken = response.nextPageToken;
  } while (pageToken);

  return { messageIds, truncated: false };
}

async function recordIncompleteRecovery(
  integration: GmailSyncIntegration,
  dependencies: GmailSyncProcessorDependencies,
  traceId: string,
  recoveredMessageCount: number,
  maxMessages: number,
): Promise<void> {
  const now = dependencies.now?.() ?? new Date();
  await markRecoveryIncomplete(integration.id, now);
  (dependencies.emitAlert ?? emitOpsAlert)({
    category: 'gmail_inbound',
    message: 'Gmail stale-history recovery exceeded its safe message bound',
    level: 'error',
    tags: { orgId: integration.organizationId },
    fingerprint: ['ops-alert', 'gmail_inbound', 'recovery_truncated', integration.id],
    extra: {
      integrationId: integration.id,
      maxMessages,
      recoveredMessageCount,
      traceId,
    },
  });
}

async function recoverStaleHistory(
  integration: GmailSyncIntegration,
  client: GmailApiClient,
  dependencies: GmailSyncProcessorDependencies,
  traceId: string,
  ensureLockOwned: () => Promise<void>,
  options: { maxMessages: number; query: string },
): Promise<void> {
  const { maxMessages, query } = options;
  const recovery = await listRecoveryMessageIds(client, maxMessages, query);
  const messageIds = recovery.messageIds;
  const queuedCount = await enqueueGmailMessages(
    integration,
    messageIds,
    client,
    dependencies.inboundQueue,
    traceId,
  );
  if (recovery.truncated) {
    await ensureLockOwned();
    await recordIncompleteRecovery(
      integration,
      dependencies,
      traceId,
      messageIds.size,
      maxMessages,
    );
    return;
  }

  const topicName = process.env.GMAIL_PUBSUB_TOPIC?.trim();
  if (!topicName) {
    throw new EmailNotConfiguredError('Gmail Pub/Sub topic missing during stale-history recovery');
  }
  const watch = await client.watch(buildInboxWatchRequest(topicName));

  // Close the list-to-watch race: anything delivered after the first bounded
  // list but before the new watch baseline is visible in this second list.
  const catchUp = await listRecoveryMessageIds(client, maxMessages, query);
  const catchUpMessageIds = new Set(
    [...catchUp.messageIds]
      .filter((messageId) => !messageIds.has(messageId)),
  );
  const catchUpQueuedCount = await enqueueGmailMessages(
    integration,
    catchUpMessageIds,
    client,
    dependencies.inboundQueue,
    traceId,
  );
  if (catchUp.truncated) {
    await ensureLockOwned();
    await recordIncompleteRecovery(
      integration,
      dependencies,
      traceId,
      messageIds.size + catchUpMessageIds.size,
      maxMessages,
    );
    return;
  }

  // Recovery intentionally establishes a new baseline. This is the only path,
  // other than initial connection, that may replace an existing checkpoint.
  await ensureLockOwned();
  await establishRecoveredCheckpoint(
    integration.id,
    watch,
    dependencies.now?.() ?? new Date(),
  );
  logger.warn(
    {
      integrationId: integration.id,
      recoveredMessageCount: messageIds.size + catchUpMessageIds.size,
      queuedMessageCount: queuedCount + catchUpQueuedCount,
      traceId,
    },
    '[Gmail Sync] Recovered from a stale history checkpoint',
  );
}

export async function processGmailSyncJob(
  jobData: GmailSyncJobData,
  dependencies: GmailSyncProcessorDependencies,
): Promise<void> {
  const lock = await acquireGmailIntegrationLock(dependencies.redis, jobData.integrationId);
  const ensureLockOwned = async (): Promise<void> => {
    await lock.renew();
    lock.assertOwned();
  };
  try {
    const integration = await loadIntegration(jobData.integrationId);
    if (!integration) {
      logger.info({ integrationId: jobData.integrationId }, '[Gmail Sync] Integration no longer exists');
      return;
    }

    const storedHistoryId = readStoredGmailHistoryId(integration.metadata);
    const operatorRecovery = jobData.source === 'operator_recovery';
    if (
      !isNativeGmailInboundEnabled(integration, operatorRecovery)
      || !integration.refreshToken
      || !storedHistoryId
    ) {
      logger.info(
        { integrationId: integration.id },
        '[Gmail Sync] Integration is not eligible for native inbound sync',
      );
      return;
    }

    if (
      typeof jobData.notifiedHistoryId === 'string'
      && isValidGmailHistoryId(jobData.notifiedHistoryId)
      && historyIdAtOrAfter(storedHistoryId, jobData.notifiedHistoryId)
    ) {
      logger.info(
        { integrationId: integration.id, traceId: jobData.traceId },
        '[Gmail Sync] Notification is already covered by the checkpoint',
      );
      return;
    }

    const client = dependencies.createClient?.(integration) ?? new GmailApiClient(integration);
    const requestedRecoveryMax = operatorRecovery
      ? jobData.recoveryMaxMessages
      : dependencies.recoveryMaxMessages;
    const recoveryMaxMessages = requestedRecoveryMax === undefined
      ? GMAIL_RECOVERY_MAX_MESSAGES
      : requestedRecoveryMax;
    if (
      !Number.isInteger(recoveryMaxMessages)
      || recoveryMaxMessages < 1
      || recoveryMaxMessages > GMAIL_OPERATOR_RECOVERY_MAX_MESSAGES
    ) {
      throw new RangeError(
        `Gmail recoveryMaxMessages must be between 1 and ${GMAIL_OPERATOR_RECOVERY_MAX_MESSAGES}`,
      );
    }
    const recoveryQuery = operatorRecovery
      ? jobData.recoveryQuery?.trim() || GMAIL_RECOVERY_QUERY
      : GMAIL_RECOVERY_QUERY;
    if (recoveryQuery.length > 256) {
      throw new RangeError('Gmail recoveryQuery must be 256 characters or fewer');
    }
    let history;
    try {
      history = await client.listHistory({
        startHistoryId: storedHistoryId,
        historyTypes: ['messageAdded'],
      });
    } catch (error) {
      if (isGmailApiError(error) && error.kind === 'stale_history') {
        await recoverStaleHistory(
          integration,
          client,
          dependencies,
          jobData.traceId,
          ensureLockOwned,
          { maxMessages: recoveryMaxMessages, query: recoveryQuery },
        );
        return;
      }
      throw error;
    }

    const messageIds = new Set<string>();
    for (const record of history.history) {
      for (const added of record.messagesAdded ?? []) {
        messageIds.add(added.message.id);
      }
    }

    await enqueueGmailMessages(
      integration,
      messageIds,
      client,
      dependencies.inboundQueue,
      jobData.traceId,
    );

    // This write is deliberately last: any fetch, parse, or enqueue failure
    // leaves the old checkpoint intact so BullMQ can retry the whole range.
    await ensureLockOwned();
    await advanceCheckpoint(
      integration.id,
      history.historyId,
      dependencies.now?.() ?? new Date(),
    );
    logger.info(
      {
        integrationId: integration.id,
        messageCount: messageIds.size,
        traceId: jobData.traceId,
      },
      '[Gmail Sync] Mailbox history synchronized',
    );
  } catch (error) {
    if (isGmailApiError(error) && error.kind === 'authentication') {
      await markReauthorizationRequired(jobData.integrationId);
    }
    throw error;
  } finally {
    await lock.release();
  }
}

export function calculateGmailSyncBackoff(
  attemptsMade: number,
  error: Error | undefined,
  random: () => number = Math.random,
): number {
  if (error instanceof RangeError) {
    return -1;
  }

  if (
    isGmailApiError(error)
    && !error.retryable
    && error.kind !== 'stale_history'
  ) {
    return -1;
  }

  const exponential = Math.min(
    GMAIL_RETRY_BASE_MS * (2 ** Math.max(0, attemptsMade - 1)),
    15 * 60 * 1_000,
  );
  const requested = isGmailApiError(error) && error.retryAfterMs !== undefined
    ? Math.max(exponential, error.retryAfterMs)
    : exponential;
  const jittered = requested + Math.floor(requested * 0.2 * random());
  return Math.min(jittered, GMAIL_RETRY_MAX_MS);
}

export function createGmailSyncWorker(
  options: GmailSyncWorkerRegistrationOptions,
): Worker<GmailSyncJobData> {
  const worker = new Worker<GmailSyncJobData>(
    QUEUE.GMAIL_SYNC,
    (job: Job<GmailSyncJobData>) => processGmailSyncJob(job.data, options),
    {
      ...options.workerOptions,
      settings: {
        backoffStrategy: (attemptsMade, _type, error) => (
          calculateGmailSyncBackoff(attemptsMade, error)
        ),
      },
    },
  );

  registerJobFailureLogging(worker, {
    logMessage: '[Gmail Sync] Job failed permanently',
    logFields: (job) => ({ jobId: job?.id }),
    failureExtra: (job) => ({
      jobId: job?.id,
      queue: QUEUE.GMAIL_SYNC,
      integrationId: job?.data?.integrationId,
      traceId: job?.data?.traceId,
      attemptsMade: job?.attemptsMade,
    }),
  });

  return worker;
}
