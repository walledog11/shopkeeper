import { db, EmailProvider, Prisma } from '@shopkeeper/db';
import { getEmailProvider } from '@shopkeeper/email/providers';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { captureIntegrationConnectionCompleted } from '@/lib/server/product-analytics';

export type EmailIntegrationProvider = 'gmail' | 'postmark';

export type UpsertEmailIntegrationArgs = {
  externalAccountId: string;
  fromEmail?: string;
  inboundMode?: 'hybrid' | 'native' | 'postmark';
  oauthScopes?: readonly string[];
  organizationId: string;
  provider: EmailIntegrationProvider;
  gmailMetadata?: Record<string, unknown>;
} & (
  | {
      accessToken: string;
      provider: 'gmail';
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
  inboundMode?: 'hybrid' | 'native' | 'postmark',
  gmailState?: Record<string, unknown>,
): PrismaTypes.InputJsonObject {
  const existing = isRecord(existingMetadata) && existingMetadata.provider === provider
    ? existingMetadata
    : {};
  const base = {
    ...existing,
    provider,
    ...(inboundMode && { inboundMode }),
    ...(oauthScopes && { oauthScopes: [...oauthScopes] }),
  };

  if (provider === 'gmail' && gmailState) {
    const existingGmail = isRecord(existing.gmail) ? existing.gmail : {};
    return {
      ...base,
      gmail: {
        ...existingGmail,
        ...gmailState,
      },
    } as PrismaTypes.InputJsonObject;
  }

  return base as PrismaTypes.InputJsonObject;
}

export async function upsertEmailIntegration(
  args: UpsertEmailIntegrationArgs,
): Promise<string> {
  const provider = args.provider === 'gmail' ? EmailProvider.gmail : EmailProvider.postmark;
  const emailIntegrations = await db.integration.findMany({
    where: { organizationId: args.organizationId, platform: 'email' },
  });
  const existing = emailIntegrations.find((integration) =>
    integration.emailProvider === provider
    || (integration.emailProvider === null && getEmailProvider(integration) === args.provider));
  const data = {
    accessToken: args.accessToken ?? null,
    refreshToken: args.refreshToken ?? null,
    tokenExpiresAt: args.tokenExpiresAt ?? null,
    fromEmail: args.fromEmail ?? existing?.fromEmail ?? args.externalAccountId,
    emailProvider: provider,
    metadata: mergeEmailMetadata(
      existing?.metadata,
      args.provider,
      args.oauthScopes,
      args.inboundMode,
      args.provider === 'gmail' ? args.gmailMetadata : undefined,
    ),
  } satisfies PrismaTypes.IntegrationUncheckedUpdateInput;

  let saved;
  if (existing) {
    saved = await db.integration.update({
      where: { id: existing.id },
      data: { ...data, externalAccountId: args.externalAccountId },
    });
  } else {
    try {
      saved = await db.integration.create({
        data: {
          organizationId: args.organizationId,
          platform: 'email',
          externalAccountId: args.externalAccountId,
          ...data,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const raced = await db.integration.findUnique({
        where: {
          organizationId_emailProvider: {
            organizationId: args.organizationId,
            emailProvider: provider,
          },
        },
      });
      if (!raced) throw error;
      saved = await db.integration.update({
        where: { id: raced.id },
        data: { ...data, externalAccountId: args.externalAccountId },
      });
    }
  }

  await db.organization.updateMany({
    where: { id: args.organizationId, defaultEmailIntegrationId: null },
    data: { defaultEmailIntegrationId: saved.id },
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
  const integrationId = await upsertEmailIntegration({
    organizationId: args.organizationId,
    externalAccountId: args.externalAccountId,
    fromEmail: args.fromEmail,
    provider: 'postmark',
  });
  return db.integration.findUniqueOrThrow({ where: { id: integrationId } });
}
