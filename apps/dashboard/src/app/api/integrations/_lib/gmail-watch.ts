import { db } from '@shopkeeper/db';
import type { Prisma as PrismaTypes } from '@prisma/client';
import {
  buildGmailWatchFailureUpdate,
  buildInboxWatchRequest,
  classifyWatchError,
  EmailNotConfiguredError,
  GmailApiClient,
  getEmailProvider,
  hasNativeGmailWatch,
  metadataWithGmailState,
  type GmailWatchErrorCategory,
} from '@shopkeeper/email';
import { readEnv } from '@/lib/env/helpers';
import logger from '@/lib/server/logger';

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

const EPOCH_SENTINEL = new Date(0);

async function updateWatchSuccess(
  integrationId: string,
  response: { expiration: string; historyId: string },
): Promise<void> {
  const integration = await db.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { metadata: true },
  });

  await db.integration.update({
    where: { id: integrationId },
    data: {
      metadata: metadataWithGmailState(
        integration.metadata,
        {
          inboundStatus: 'active',
          historyId: response.historyId,
          watchFailureCount: 0,
          watchExpiration: response.expiration,
          watchLastRenewedAt: new Date().toISOString(),
        },
        { clearLastError: true, confirmReadScope: true },
      ) as PrismaTypes.InputJsonObject,
    },
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
  const failure = buildGmailWatchFailureUpdate(integration.metadata, category, new Date());
  await db.integration.update({
    where: { id: integrationId },
    data: {
      metadata: failure.metadata as PrismaTypes.InputJsonObject,
      ...(failure.markReauthorization ? { tokenExpiresAt: EPOCH_SENTINEL } : {}),
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
    const response = await new GmailApiClient(integration).watch(buildInboxWatchRequest(topicName));
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
