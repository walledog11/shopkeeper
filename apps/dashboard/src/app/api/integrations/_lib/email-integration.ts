import { db, EmailProvider, Prisma } from '@shopkeeper/db';
import {
  assertNoDualInboundDelivery,
  DUAL_INBOUND_MESSAGE,
  findEmailIntegrations,
} from '@shopkeeper/email';
import { getEmailProvider } from '@shopkeeper/email/providers';
import { BadRequestError } from '@/lib/api/errors';
import type { Prisma as PrismaTypes } from '@prisma/client';

import { isRecord } from "@shopkeeper/shared/guards";
export type EmailIntegrationProvider = 'gmail' | 'postmark';

export type UpsertEmailIntegrationArgs = {
  externalAccountId: string;
  fromEmail?: string;
  /** Gmail send-only: disables watch while Postmark handles inbound. */
  inboundMode?: 'postmark';
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


function mergeEmailMetadata(
  existingMetadata: unknown,
  provider: EmailIntegrationProvider,
  oauthScopes?: readonly string[],
  inboundMode?: 'postmark',
  gmailState?: Record<string, unknown>,
): PrismaTypes.InputJsonObject {
  const existing = isRecord(existingMetadata) && existingMetadata.provider === provider
    ? existingMetadata
    : {};
  const base: Record<string, unknown> = {
    ...existing,
    provider,
    ...(oauthScopes && { oauthScopes: [...oauthScopes] }),
  };
  if (provider === 'gmail' && inboundMode === 'postmark') {
    base.inboundMode = 'postmark';
  } else {
    delete base.inboundMode;
  }

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

function assertInboundTransportAllowedAfterUpsert(input: {
  emailIntegrations: Array<{
    id: string;
    emailProvider: EmailProvider | null;
    lifecycleStatus: string;
    metadata: unknown;
  }>;
  provider: EmailIntegrationProvider;
  metadata: PrismaTypes.InputJsonObject;
}): void {
  const emailProvider = input.provider === 'gmail' ? EmailProvider.gmail : EmailProvider.postmark;
  const existing = input.emailIntegrations.find((integration) =>
    getEmailProvider(integration) === input.provider);
  const projectedUpsert = {
    ...(existing ?? { id: 'projected-new' }),
    emailProvider,
    lifecycleStatus: 'active',
    metadata: input.metadata,
  };
  const projected = [
    ...input.emailIntegrations.filter((integration) => getEmailProvider(integration) !== input.provider),
    projectedUpsert,
  ];
  const { gmail, postmark } = findEmailIntegrations(projected);
  try {
    assertNoDualInboundDelivery({ gmail, postmark });
  } catch {
    throw new BadRequestError(DUAL_INBOUND_MESSAGE);
  }
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
    // A fresh authorization makes the integration active again. Without this a
    // row left in `cleanup_failed` by a failed disconnect stays filtered out of
    // getIntegrationsForOrg, so reconnecting saves tokens the UI never shows.
    lifecycleStatus: 'active',
    metadata: mergeEmailMetadata(
      existing?.metadata,
      args.provider,
      args.oauthScopes,
      args.inboundMode,
      args.provider === 'gmail' ? args.gmailMetadata : undefined,
    ),
  } satisfies PrismaTypes.IntegrationUncheckedUpdateInput;

  assertInboundTransportAllowedAfterUpsert({
    emailIntegrations,
    provider: args.provider,
    metadata: data.metadata as PrismaTypes.InputJsonObject,
  });

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

  return saved.id;
}

async function assertForwardingEmailAllowed(organizationId: string): Promise<void> {
  const integrations = await db.integration.findMany({
    where: { organizationId, platform: 'email' },
  });
  const { gmail } = findEmailIntegrations(integrations);
  try {
    assertNoDualInboundDelivery({
      gmail,
      postmark: {
        emailProvider: 'postmark',
        lifecycleStatus: 'active',
        metadata: { provider: 'postmark' },
      },
    });
  } catch {
    throw new BadRequestError(DUAL_INBOUND_MESSAGE);
  }
}

export async function saveForwardingEmailIntegration(args: {
  externalAccountId: string;
  fromEmail: string;
  organizationId: string;
}) {
  await assertForwardingEmailAllowed(args.organizationId);
  const integrationId = await upsertEmailIntegration({
    organizationId: args.organizationId,
    externalAccountId: args.externalAccountId,
    fromEmail: args.fromEmail,
    provider: 'postmark',
  });
  return db.integration.findUniqueOrThrow({ where: { id: integrationId } });
}
