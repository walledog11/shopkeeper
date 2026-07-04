import { db } from '@shopkeeper/db';
import type { Prisma as PrismaTypes } from '@prisma/client';
import {
  EmailNotConfiguredError,
  GMAIL_READONLY_SCOPE,
  GmailApiClient,
  getEmailProvider,
  isGmailApiError,
} from '@shopkeeper/email';
import { readEnv } from '@/lib/env/helpers';
import logger from '@/lib/server/logger';

type GmailWatchErrorCategory =
  | 'watch_authentication'
  | 'watch_configuration'
  | 'watch_invalid_response'
  | 'watch_quota'
  | 'watch_request'
  | 'watch_retryable'
  | 'watch_stale_history'
  | 'watch_unknown';

type GmailIntegrationSnapshot = {
  id: string;
  accessToken: string | null;
  externalAccountId: string;
  metadata: unknown;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
};

export type GmailWatchRegistrationResult =
  | { ok: true; expiration: string; historyId: string }
  | { ok: false; category: GmailWatchErrorCategory };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function classifyWatchError(error: unknown): GmailWatchErrorCategory {
  if (error instanceof EmailNotConfiguredError) return 'watch_configuration';
  if (isGmailApiError(error)) return `watch_${error.kind}`;
  return 'watch_unknown';
}

function hasNativeGmailWatch(metadata: unknown): boolean {
  if (getEmailProvider({ metadata }) !== 'gmail' || !isRecord(metadata)) return false;
  const gmail = metadata.gmail;
  if (!isRecord(gmail)) return false;
  return (
    typeof gmail.historyId === 'string'
    || typeof gmail.watchExpiration === 'string'
    || gmail.inboundStatus === 'active'
  );
}

function metadataWithGmailState(
  metadata: unknown,
  gmailState: Record<string, unknown>,
  options: { clearLastError?: boolean; confirmReadScope?: boolean } = {},
): PrismaTypes.InputJsonObject {
  const existing = isRecord(metadata) ? metadata : {};
  const existingGmail = isRecord(existing.gmail) ? existing.gmail : {};
  const gmailBase = options.clearLastError
    ? Object.fromEntries(
        Object.entries(existingGmail).filter(([key]) => key !== 'lastError'),
      )
    : existingGmail;
  const oauthScopes = Array.isArray(existing.oauthScopes)
    ? existing.oauthScopes.filter((scope): scope is string => typeof scope === 'string')
    : [];

  return {
    ...existing,
    provider: 'gmail',
    ...(options.confirmReadScope && !oauthScopes.includes(GMAIL_READONLY_SCOPE)
      ? { oauthScopes: [...oauthScopes, GMAIL_READONLY_SCOPE] }
      : {}),
    gmail: {
      ...gmailBase,
      ...gmailState,
    },
  } as PrismaTypes.InputJsonObject;
}

async function updateWatchSuccess(
  integrationId: string,
  response: { expiration: string; historyId: string },
): Promise<void> {
  const integration = await db.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { metadata: true },
  });
  const metadata = metadataWithGmailState(
    integration.metadata,
    {
      inboundStatus: 'active',
      historyId: response.historyId,
      watchFailureCount: 0,
      watchExpiration: response.expiration,
      watchLastRenewedAt: new Date().toISOString(),
    },
    { clearLastError: true, confirmReadScope: true },
  );

  await db.integration.update({
    where: { id: integrationId },
    data: { metadata },
  });
}

async function updateWatchFailure(
  integrationId: string,
  category: GmailWatchErrorCategory,
): Promise<void> {
  const integration = await db.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { metadata: true },
  });
  await db.integration.update({
    where: { id: integrationId },
    data: {
      metadata: metadataWithGmailState(integration.metadata, {
        inboundStatus: 'degraded',
        lastError: category,
      }),
    },
  });
}

export async function registerGmailWatch(
  integrationId: string,
): Promise<GmailWatchRegistrationResult> {
  const integration = await db.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
    },
  });
  const topicName = readEnv('GMAIL_PUBSUB_TOPIC');

  try {
    if (!topicName) {
      throw new EmailNotConfiguredError('Gmail Pub/Sub topic missing');
    }
    const response = await new GmailApiClient(integration).watch({
      topicName,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'include',
    });
    await updateWatchSuccess(integrationId, response);
    logger.info({ integrationId }, '[Gmail Watch] Watch registered');
    return { ok: true, ...response };
  } catch (error) {
    const category = classifyWatchError(error);
    await updateWatchFailure(integrationId, category);
    logger.warn(
      { integrationId, errorCategory: category },
      '[Gmail Watch] Watch registration failed',
    );
    return { ok: false, category };
  }
}

export async function stopGmailWatchIfUnused(
  integration: GmailIntegrationSnapshot,
): Promise<void> {
  if (!hasNativeGmailWatch(integration.metadata)) return;

  const sameMailbox = await db.integration.findMany({
    where: {
      id: { not: integration.id },
      platform: 'email',
      externalAccountId: { equals: integration.externalAccountId, mode: 'insensitive' },
    },
    select: { metadata: true },
  });
  if (sameMailbox.some((candidate) => hasNativeGmailWatch(candidate.metadata))) return;

  try {
    await new GmailApiClient(integration, {
      // A disconnected row may already have been replaced in place. Do not write a
      // refreshed cleanup token into the replacement integration.
      persistToken: async () => undefined,
    }).stop();
    logger.info({ integrationId: integration.id }, '[Gmail Watch] Watch stopped');
  } catch (error) {
    logger.warn(
      {
        integrationId: integration.id,
        errorCategory: classifyWatchError(error),
      },
      '[Gmail Watch] Failed to stop watch during disconnect',
    );
  }
}
