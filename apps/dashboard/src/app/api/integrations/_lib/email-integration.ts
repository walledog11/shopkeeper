import { db } from '@shopkeeper/db';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { captureIntegrationConnectionCompleted } from '@/lib/server/product-analytics';
import { upsertRaceSafeIntegration } from './integration-upsert';
import { stopGmailWatchIfUnused } from './gmail-watch';

export type EmailIntegrationProvider = 'gmail' | 'outlook' | 'postmark';

export type UpsertExclusiveEmailIntegrationArgs = {
  externalAccountId: string;
  fromEmail?: string;
  oauthScopes?: readonly string[];
  organizationId: string;
  provider: EmailIntegrationProvider;
} & (
  | {
      accessToken: string;
      provider: 'gmail' | 'outlook';
      refreshToken: string;
      tokenExpiresAt: Date;
    }
  | {
      accessToken?: null;
      provider: 'postmark';
      refreshToken?: null;
      tokenExpiresAt?: null;
    }
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeEmailMetadata(
  existingMetadata: unknown,
  provider: EmailIntegrationProvider,
  oauthScopes?: readonly string[],
): PrismaTypes.InputJsonObject {
  const existing = isRecord(existingMetadata) && existingMetadata.provider === provider
    ? existingMetadata
    : {};
  return {
    ...existing,
    provider,
    ...(oauthScopes && { oauthScopes: [...oauthScopes] }),
  } as PrismaTypes.InputJsonObject;
}

export async function upsertExclusiveEmailIntegration(
  args: UpsertExclusiveEmailIntegrationArgs,
): Promise<string> {
  const priorIntegrations = await db.integration.findMany({
    where: { organizationId: args.organizationId, platform: 'email' },
  });
  const existing = await db.integration.findUnique({
    where: {
      organizationId_platform_externalAccountId: {
        organizationId: args.organizationId,
        platform: 'email',
        externalAccountId: args.externalAccountId,
      },
    },
    select: { metadata: true },
  });
  const saved = await upsertRaceSafeIntegration({
    organizationId: args.organizationId,
    platform: 'email',
    externalAccountId: args.externalAccountId,
    data: {
      accessToken: args.accessToken ?? null,
      refreshToken: args.refreshToken ?? null,
      tokenExpiresAt: args.tokenExpiresAt ?? null,
      fromEmail: args.fromEmail ?? args.externalAccountId,
      metadata: mergeEmailMetadata(existing?.metadata, args.provider, args.oauthScopes),
    },
  });

  await Promise.all(
    priorIntegrations
      .filter((integration) => integration.id !== saved.id || args.provider !== 'gmail')
      .map((integration) => stopGmailWatchIfUnused(integration)),
  );
  await db.integration.deleteMany({
    where: { organizationId: args.organizationId, platform: 'email', id: { not: saved.id } },
  });

  await captureIntegrationConnectionCompleted({
    integrationId: saved.id,
    organizationId: args.organizationId,
    platform: 'email',
  });
  return saved.id;
}

export async function saveForwardingEmailIntegration(args: {
  externalAccountId: string;
  fromEmail: string;
  organizationId: string;
}) {
  const priorIntegrations = await db.integration.findMany({
    where: { organizationId: args.organizationId, platform: 'email' },
  });
  const existing = await db.integration.findUnique({
    where: {
      organizationId_platform_externalAccountId: {
        organizationId: args.organizationId,
        platform: 'email',
        externalAccountId: args.externalAccountId,
      },
    },
    select: { metadata: true },
  });
  const integration = await upsertRaceSafeIntegration({
    organizationId: args.organizationId,
    platform: 'email',
    externalAccountId: args.externalAccountId,
    data: {
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      fromEmail: args.fromEmail,
      metadata: mergeEmailMetadata(existing?.metadata, 'postmark'),
    },
  });

  await Promise.all(
    priorIntegrations.map((prior) => stopGmailWatchIfUnused(prior)),
  );
  await db.integration.deleteMany({
    where: { organizationId: args.organizationId, platform: 'email', id: { not: integration.id } },
  });

  await captureIntegrationConnectionCompleted({
    integrationId: integration.id,
    organizationId: args.organizationId,
    platform: 'email',
  });
  return integration;
}
