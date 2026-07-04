import { randomUUID } from 'node:crypto';
import { Worker, type Job, type Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { db } from '@shopkeeper/db';
import {
  EmailNotConfiguredError,
  GmailApiClient,
  getEmailProvider,
  isForSupportAddress,
  isGmailApiError,
  normalizeInboundEmail,
  parseMime,
} from '@shopkeeper/email';
import { getEmailInboundMode } from '../config/env.js';
import { isGmailNativeInboundEnabled } from '../config/runtime-config.js';
import { CHANNEL, JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import type { GmailSyncJobData, InboundJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

const GMAIL_SYNC_LOCK_TTL_MS = 15 * 60 * 1_000;
const GMAIL_RECOVERY_MAX_RESULTS = 500;
const GMAIL_RECOVERY_QUERY = 'newer_than:7d in:inbox';
const RELEASE_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
const HISTORY_ID_PATTERN = /^\d+$/;

export interface GmailSyncRedis {
  set(
    key: string,
    value: string,
    expiryMode: 'PX',
    ttlMilliseconds: number,
    setMode: 'NX',
  ): Promise<unknown>;
  eval(script: string, numberOfKeys: number, key: string, token: string): Promise<unknown>;
}

interface GmailSyncIntegration {
  id: string;
  accessToken: string | null;
  externalAccountId: string;
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
  now?: () => Date;
}

export interface GmailSyncWorkerRegistrationOptions extends GmailSyncProcessorDependencies {
  workerOptions: SharedGatewayWorkerOptions;
}

export class GmailSyncLockUnavailableError extends Error {
  constructor() {
    super('Gmail integration sync is already in progress');
    this.name = 'GmailSyncLockUnavailableError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function gmailMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!isRecord(metadata) || !isRecord(metadata.gmail)) return null;
  return metadata.gmail;
}

function isNativeGmailInboundEnabled(integration: GmailSyncIntegration): boolean {
  if (!isGmailNativeInboundEnabled()) return false;
  if (getEmailInboundMode() === 'postmark') return false;
  if (getEmailProvider(integration) !== 'gmail' || !isRecord(integration.metadata)) return false;
  if (integration.metadata.inboundMode === 'postmark') return false;
  return gmailMetadata(integration.metadata)?.inboundStatus === 'active';
}

function readHistoryId(metadata: unknown): string | null {
  const historyId = gmailMetadata(metadata)?.historyId;
  return typeof historyId === 'string' && HISTORY_ID_PATTERN.test(historyId)
    ? historyId
    : null;
}

function historyIdAtOrAfter(left: string, right: string): boolean {
  return BigInt(left) >= BigInt(right);
}

function maxHistoryId(left: string, right: string): string {
  return historyIdAtOrAfter(left, right) ? left : right;
}

function normalizeAddress(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function providerMessageKey(messageId: string): string {
  return `gmail:${messageId}`;
}

export async function acquireGmailIntegrationLock(
  redis: GmailSyncRedis,
  integrationId: string,
): Promise<{ release: () => Promise<void> }> {
  const key = `gmail-sync:lock:${integrationId}`;
  const token = randomUUID();
  const acquired = await redis.set(key, token, 'PX', GMAIL_SYNC_LOCK_TTL_MS, 'NX');
  if (acquired !== 'OK') throw new GmailSyncLockUnavailableError();

  return {
    release: async () => {
      try {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
      } catch {
        // The expiry is the final safety net. A release failure must not hide
        // successful durable enqueueing or the original sync error.
        logger.warn({ integrationId }, '[Gmail Sync] Failed to release integration lock');
      }
    },
  };
}

function metadataWithGmailState(
  metadata: unknown,
  gmailState: Record<string, unknown>,
  options: { clearLastError?: boolean } = {},
): Prisma.InputJsonObject {
  const existing = isRecord(metadata) ? metadata : {};
  const existingGmail = isRecord(existing.gmail) ? existing.gmail : {};
  const gmailBase = options.clearLastError
    ? Object.fromEntries(
        Object.entries(existingGmail).filter(([key]) => key !== 'lastError'),
      )
    : existingGmail;

  return {
    ...existing,
    provider: 'gmail',
    gmail: {
      ...gmailBase,
      ...gmailState,
    },
  } as Prisma.InputJsonObject;
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
      }),
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

  const currentHistoryId = readHistoryId(current.metadata);
  const historyId = currentHistoryId
    ? maxHistoryId(currentHistoryId, processedHistoryId)
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
      ),
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
      ),
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
  let queuedCount = 0;

  for (const messageId of messageIds) {
    const message = await client.getMessageRaw(messageId);
    const labels = new Set(message.labelIds ?? []);
    if (!labels.has('INBOX') || labels.has('SENT')) continue;

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
    if (parsed.from && merchantAddresses.has(parsed.from.toLowerCase())) continue;
    if (!isForSupportAddress(parsed, supportAddress)) continue;

    const normalized = normalizeInboundEmail(parsed);
    if (!normalized) {
      logger.warn(
        { gmailMessageId: message.id, integrationId: integration.id },
        '[Gmail Sync] Skipping non-actionable parsed message',
      );
      continue;
    }

    const inboundMessageId = normalized.inboundMessageId || providerMessageKey(message.id);
    await inboundQueue.add(
      JOB.EMAIL,
      {
        platform: CHANNEL.EMAIL,
        organizationId: integration.organizationId,
        senderEmail: normalized.senderEmail,
        senderName: normalized.senderName,
        subject: normalized.subject,
        body: normalized.body,
        inboundMessageId,
        traceId,
        ...(normalized.attachments.length > 0
          ? { attachments: normalized.attachments }
          : {}),
      },
      { jobId: `gmail-inbound-${integration.id}-${message.id}` },
    );
    queuedCount += 1;
  }

  return queuedCount;
}

async function recoverStaleHistory(
  integration: GmailSyncIntegration,
  client: GmailApiClient,
  dependencies: GmailSyncProcessorDependencies,
  traceId: string,
): Promise<void> {
  const recovery = await client.listMessages({
    maxResults: GMAIL_RECOVERY_MAX_RESULTS,
    query: GMAIL_RECOVERY_QUERY,
    labelIds: ['INBOX'],
    includeSpamTrash: false,
  });
  const messageIds = new Set(recovery.messages.map((message) => message.id));
  const queuedCount = await enqueueGmailMessages(
    integration,
    messageIds,
    client,
    dependencies.inboundQueue,
    traceId,
  );

  const topicName = process.env.GMAIL_PUBSUB_TOPIC?.trim();
  if (!topicName) {
    throw new EmailNotConfiguredError('Gmail Pub/Sub topic missing during stale-history recovery');
  }
  const watch = await client.watch({
    topicName,
    labelIds: ['INBOX'],
    labelFilterBehavior: 'include',
  });

  // Close the list-to-watch race: anything delivered after the first bounded
  // list but before the new watch baseline is visible in this second list.
  const catchUp = await client.listMessages({
    maxResults: GMAIL_RECOVERY_MAX_RESULTS,
    query: GMAIL_RECOVERY_QUERY,
    labelIds: ['INBOX'],
    includeSpamTrash: false,
  });
  const catchUpMessageIds = new Set(
    catchUp.messages
      .map((message) => message.id)
      .filter((messageId) => !messageIds.has(messageId)),
  );
  const catchUpQueuedCount = await enqueueGmailMessages(
    integration,
    catchUpMessageIds,
    client,
    dependencies.inboundQueue,
    traceId,
  );

  // Recovery intentionally establishes a new baseline. This is the only path,
  // other than initial connection, that may replace an existing checkpoint.
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
  try {
    const integration = await loadIntegration(jobData.integrationId);
    if (!integration) {
      logger.info({ integrationId: jobData.integrationId }, '[Gmail Sync] Integration no longer exists');
      return;
    }

    const storedHistoryId = readHistoryId(integration.metadata);
    if (
      !isNativeGmailInboundEnabled(integration)
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
      HISTORY_ID_PATTERN.test(jobData.notifiedHistoryId)
      && historyIdAtOrAfter(storedHistoryId, jobData.notifiedHistoryId)
    ) {
      logger.info(
        { integrationId: integration.id, traceId: jobData.traceId },
        '[Gmail Sync] Notification is already covered by the checkpoint',
      );
      return;
    }

    const client = dependencies.createClient?.(integration) ?? new GmailApiClient(integration);
    let history;
    try {
      history = await client.listHistory({
        startHistoryId: storedHistoryId,
        historyTypes: ['messageAdded'],
      });
    } catch (error) {
      if (isGmailApiError(error) && error.kind === 'stale_history') {
        await recoverStaleHistory(integration, client, dependencies, jobData.traceId);
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

export function createGmailSyncWorker(
  options: GmailSyncWorkerRegistrationOptions,
): Worker<GmailSyncJobData> {
  const worker = new Worker<GmailSyncJobData>(
    QUEUE.GMAIL_SYNC,
    (job: Job<GmailSyncJobData>) => processGmailSyncJob(job.data, options),
    options.workerOptions,
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
