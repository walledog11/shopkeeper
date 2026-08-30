import type { Prisma } from '@prisma/client';
import { db, INTEGRATION_REAUTH_SENTINEL } from '@shopkeeper/db';
import {
  maxGmailHistoryId,
  metadataWithGmailState,
  readStoredGmailHistoryId,
} from '@shopkeeper/email';
import type { GmailSyncIntegration } from './types.js';

export async function markReauthorizationRequired(integrationId: string): Promise<void> {
  const current = await db.integration.findUnique({
    where: { id: integrationId },
    select: { metadata: true },
  });
  if (!current) return;

  await db.integration.update({
    where: { id: integrationId },
    data: {
      tokenExpiresAt: INTEGRATION_REAUTH_SENTINEL,
      metadata: metadataWithGmailState(current.metadata, {
        inboundStatus: 'reauthorization_required',
        lastError: 'sync_authentication',
      }) as Prisma.InputJsonObject,
    },
  });
}

export async function advanceCheckpoint(
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

export async function markRecoveryIncomplete(
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

export async function establishRecoveredCheckpoint(
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

export async function loadIntegration(integrationId: string): Promise<GmailSyncIntegration | null> {
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
