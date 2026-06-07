import { db } from '@shopkeeper/db';
import { upsertRaceSafeIntegration } from './integration-upsert';

export type EmailIntegrationProvider = 'gmail' | 'outlook' | 'postmark';

export type UpsertExclusiveEmailIntegrationArgs = {
  externalAccountId: string;
  fromEmail?: string;
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

export async function upsertExclusiveEmailIntegration(
  args: UpsertExclusiveEmailIntegrationArgs,
): Promise<string> {
  const saved = await upsertRaceSafeIntegration({
    organizationId: args.organizationId,
    platform: 'email',
    externalAccountId: args.externalAccountId,
    data: {
      accessToken: args.accessToken ?? null,
      refreshToken: args.refreshToken ?? null,
      tokenExpiresAt: args.tokenExpiresAt ?? null,
      fromEmail: args.fromEmail ?? args.externalAccountId,
      metadata: { provider: args.provider },
    },
  });

  await db.integration.deleteMany({
    where: { organizationId: args.organizationId, platform: 'email', id: { not: saved.id } },
  });

  return saved.id;
}

export async function saveForwardingEmailIntegration(args: {
  externalAccountId: string;
  fromEmail: string;
  organizationId: string;
}) {
  const integration = await upsertRaceSafeIntegration({
    organizationId: args.organizationId,
    platform: 'email',
    externalAccountId: args.externalAccountId,
    data: {
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      fromEmail: args.fromEmail,
      metadata: { provider: 'postmark' },
    },
  });

  await db.integration.deleteMany({
    where: { organizationId: args.organizationId, platform: 'email', id: { not: integration.id } },
  });

  return integration;
}
