import type { Prisma } from '@prisma/client';
import { db } from '@shopkeeper/db';
import {
  buildGmailWatchFailureUpdate,
  buildInboxWatchRequest,
  classifyWatchError,
  EmailNotConfiguredError,
  GmailApiClient,
  getEmailProvider,
  getGmailMetadata,
  isValidGmailHistoryId,
  metadataWithGmailState,
  type GmailWatchErrorCategory,
} from '@shopkeeper/email';
import { getEmailInboundMode } from '../config/env.js';
import { isGmailNativeInboundEnabled } from '../config/runtime-config.js';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import { emitOpsAlert } from '../ops-alerts.js';
import {
  acquireGmailIntegrationLock,
  GmailSyncLockUnavailableError,
  type GmailSyncRedis,
} from '../lib/gmail-sync-lock.js';
import { isRecord, readString } from '../lib/typing.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_HOUR_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

const GMAIL_WATCH_MAINTENANCE_INTERVAL_MS = 12 * ONE_HOUR_MS;
const GMAIL_WATCH_RENEWAL_WINDOW_MS = 24 * ONE_HOUR_MS;
const GMAIL_STALE_SYNC_THRESHOLD_MS = 2 * ONE_HOUR_MS;
const GMAIL_REPEATED_WATCH_FAILURE_THRESHOLD = 3;
const EPOCH_SENTINEL = new Date(0);

interface GmailWatchIntegration {
  id: string;
  accessToken: string | null;
  createdAt: Date;
  externalAccountId: string;
  metadata: unknown;
  organizationId: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export interface GmailWatchMaintenanceDependencies {
  redis: GmailSyncRedis;
  createClient?: (integration: GmailWatchIntegration) => GmailApiClient;
  emitAlert?: typeof emitOpsAlert;
  now?: () => Date;
  topicName?: string | null;
}

export interface GmailWatchMaintenanceResult {
  checked: number;
  renewed: number;
  failed: number;
  skippedForLock: number;
  staleSyncWarnings: number;
  alerts: number;
}

function readTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const numeric = Number(value);
  const timestamp = Number.isFinite(numeric) ? numeric : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function readNonNegativeInteger(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : 0;
}

function isNativeGmailIntegration(integration: GmailWatchIntegration): boolean {
  if (!isGmailNativeInboundEnabled()) return false;
  if (getEmailInboundMode() === 'postmark') return false;
  if (getEmailProvider(integration) !== 'gmail' || !isRecord(integration.metadata)) {
    return false;
  }
  if (integration.metadata.inboundMode === 'postmark') return false;
  const gmail = getGmailMetadata(integration.metadata);
  if (gmail?.inboundStatus === 'reauthorization_required') return false;
  return integration.metadata.inboundMode === 'hybrid'
    || integration.metadata.inboundMode === 'native'
    || gmail?.inboundStatus === 'pending'
    || gmail?.inboundStatus === 'active'
    || gmail?.inboundStatus === 'degraded';
}

function needsWatchRenewal(integration: GmailWatchIntegration, nowMs: number): boolean {
  const gmail = getGmailMetadata(integration.metadata);
  if (!gmail) return true;
  if (gmail.inboundStatus === 'degraded' || gmail.inboundStatus === 'pending') return true;
  const expiration = readTimestamp(gmail.watchExpiration);
  return expiration === null || expiration <= nowMs + GMAIL_WATCH_RENEWAL_WINDOW_MS;
}

async function loadIntegration(integrationId: string): Promise<GmailWatchIntegration | null> {
  return db.integration.findUnique({
    where: { id: integrationId },
    select: {
      id: true,
      accessToken: true,
      createdAt: true,
      externalAccountId: true,
      metadata: true,
      organizationId: true,
      refreshToken: true,
      tokenExpiresAt: true,
    },
  });
}

async function markWatchSuccess(
  integration: GmailWatchIntegration,
  response: { expiration: string; historyId: string },
  now: Date,
): Promise<GmailWatchIntegration> {
  const gmail = getGmailMetadata(integration.metadata);
  const existingHistoryId = readString(gmail?.historyId);
  const historyId = existingHistoryId && isValidGmailHistoryId(existingHistoryId)
    ? existingHistoryId
    : response.historyId;
  const metadata = metadataWithGmailState(
    integration.metadata,
    {
      historyId,
      inboundStatus: 'active',
      watchExpiration: response.expiration,
      watchFailureCount: 0,
      watchLastRenewedAt: now.toISOString(),
    },
    { clearLastError: true },
  ) as Prisma.InputJsonObject;

  await db.integration.update({
    where: { id: integration.id },
    data: { metadata },
  });
  return { ...integration, metadata };
}

async function markWatchFailure(
  integration: GmailWatchIntegration,
  category: GmailWatchErrorCategory,
  now: Date,
): Promise<GmailWatchIntegration> {
  const failure = buildGmailWatchFailureUpdate(integration.metadata, category, now);
  const metadata = failure.metadata as Prisma.InputJsonObject;

  await db.integration.update({
    where: { id: integration.id },
    data: {
      metadata,
      ...(failure.markReauthorization ? { tokenExpiresAt: EPOCH_SENTINEL } : {}),
    },
  });
  return {
    ...integration,
    metadata,
    ...(failure.markReauthorization ? { tokenExpiresAt: EPOCH_SENTINEL } : {}),
  };
}

function monitorIntegration(
  integration: GmailWatchIntegration,
  nowMs: number,
  emitAlert: typeof emitOpsAlert,
): { alerts: number; staleSyncWarnings: number } {
  const gmail = getGmailMetadata(integration.metadata);
  if (!gmail) return { alerts: 0, staleSyncWarnings: 0 };

  let alerts = 0;
  let staleSyncWarnings = 0;
  const expiration = readTimestamp(gmail.watchExpiration);
  if (expiration !== null && expiration <= nowMs) {
    emitAlert({
      category: 'gmail_inbound',
      message: 'A Gmail inbound watch is expired',
      level: 'error',
      tags: { orgId: integration.organizationId },
      fingerprint: ['ops-alert', 'gmail_inbound', 'watch_expired', integration.id],
      extra: {
        integrationId: integration.id,
        watchExpiration: new Date(expiration).toISOString(),
      },
    });
    alerts += 1;
  }

  const failureCount = readNonNegativeInteger(gmail.watchFailureCount);
  if (failureCount >= GMAIL_REPEATED_WATCH_FAILURE_THRESHOLD) {
    emitAlert({
      category: 'gmail_inbound',
      message: 'Gmail inbound watch renewal is repeatedly failing',
      level: 'error',
      tags: { orgId: integration.organizationId },
      fingerprint: ['ops-alert', 'gmail_inbound', 'watch_renewal_failed', integration.id],
      extra: {
        errorCategory: readString(gmail.lastError),
        failureCount,
        integrationId: integration.id,
      },
    });
    alerts += 1;
  }

  if (gmail.inboundStatus === 'active') {
    const lastSync = readTimestamp(gmail.lastSyncedAt);
    const activeSince = readTimestamp(gmail.watchLastRenewedAt)
      ?? integration.createdAt.getTime();
    if (
      (lastSync === null && nowMs - activeSince >= GMAIL_STALE_SYNC_THRESHOLD_MS)
      || (lastSync !== null && nowMs - lastSync >= GMAIL_STALE_SYNC_THRESHOLD_MS)
    ) {
      logger.warn(
        {
          integrationId: integration.id,
          lastSyncedAt: lastSync === null ? null : new Date(lastSync).toISOString(),
          organizationId: integration.organizationId,
        },
        '[Gmail Watch] Active integration has no recent successful sync',
      );
      staleSyncWarnings += 1;
    }
  }

  return { alerts, staleSyncWarnings };
}

export async function runGmailWatchMaintenance(
  dependencies: GmailWatchMaintenanceDependencies,
): Promise<GmailWatchMaintenanceResult> {
  const now = dependencies.now?.() ?? new Date();
  const nowMs = now.getTime();
  const emitAlert = dependencies.emitAlert ?? emitOpsAlert;
  const topicName = dependencies.topicName === undefined
    ? process.env.GMAIL_PUBSUB_TOPIC?.trim()
    : dependencies.topicName?.trim();
  const rows = await db.integration.findMany({
    where: {
      platform: 'email',
      refreshToken: { not: null },
    },
    select: {
      id: true,
      accessToken: true,
      createdAt: true,
      externalAccountId: true,
      metadata: true,
      organizationId: true,
      refreshToken: true,
      tokenExpiresAt: true,
    },
  });
  const integrations: GmailWatchIntegration[] = rows.filter(isNativeGmailIntegration);
  const monitored = new Map<string, GmailWatchIntegration>(
    integrations.map((integration) => [integration.id, integration]),
  );
  const result: GmailWatchMaintenanceResult = {
    checked: integrations.length,
    renewed: 0,
    failed: 0,
    skippedForLock: 0,
    staleSyncWarnings: 0,
    alerts: 0,
  };

  for (const candidate of integrations) {
    if (!needsWatchRenewal(candidate, nowMs)) continue;

    let lock;
    try {
      lock = await acquireGmailIntegrationLock(dependencies.redis, candidate.id);
    } catch (error) {
      if (error instanceof GmailSyncLockUnavailableError) {
        result.skippedForLock += 1;
        logger.info(
          { integrationId: candidate.id },
          '[Gmail Watch] Renewal skipped because mailbox sync is in progress',
        );
        continue;
      }
      throw error;
    }

    try {
      const integration = await loadIntegration(candidate.id);
      if (!integration || !isNativeGmailIntegration(integration)) continue;
      if (!needsWatchRenewal(integration, nowMs)) {
        monitored.set(integration.id, integration);
        continue;
      }

      try {
        if (!topicName) throw new EmailNotConfiguredError('Gmail Pub/Sub topic missing');
        const client = dependencies.createClient?.(integration) ?? new GmailApiClient(integration);
        const response = await client.watch(buildInboxWatchRequest(topicName));
        const updated = await markWatchSuccess(integration, response, now);
        monitored.set(updated.id, updated);
        result.renewed += 1;
        logger.info(
          { integrationId: integration.id },
          '[Gmail Watch] Watch renewed',
        );
      } catch (error) {
        const category = classifyWatchError(error);
        const updated = await markWatchFailure(integration, category, now);
        monitored.set(updated.id, updated);
        result.failed += 1;
        logger.warn(
          { errorCategory: category, integrationId: integration.id },
          '[Gmail Watch] Watch renewal failed',
        );
      }
    } finally {
      await lock.release();
    }
  }

  for (const integration of monitored.values()) {
    const monitoring = monitorIntegration(integration, nowMs, emitAlert);
    result.alerts += monitoring.alerts;
    result.staleSyncWarnings += monitoring.staleSyncWarnings;
  }

  logger.info(result, '[Gmail Watch] Maintenance complete');
  return result;
}

export const registerGmailWatchMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.GMAIL_WATCH);
  await scheduleRepeatableJob(
    queue,
    JOB.GMAIL_WATCH_MAINTENANCE,
    JOB.GMAIL_WATCH_MAINTENANCE_ID,
    GMAIL_WATCH_MAINTENANCE_INTERVAL_MS,
  );

  const worker = createMaintenanceWorker(
    context,
    QUEUE.GMAIL_WATCH,
    () => runGmailWatchMaintenance({
      redis: context.producerConn as GmailSyncRedis,
    }),
    {
      label: 'GmailWatch',
      failureQueue: QUEUE.GMAIL_WATCH,
    },
  );

  return { workers: [worker], queues: [queue] };
};
