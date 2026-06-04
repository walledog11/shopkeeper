import { db } from '@clerk/db';

export type EmailIntegrationProvider = 'gmail' | 'outlook';

export interface UpsertExclusiveEmailIntegrationArgs {
  accessToken: string;
  externalAccountId: string;
  organizationId: string;
  provider: EmailIntegrationProvider;
  refreshToken: string;
  tokenExpiresAt: Date;
}

export async function upsertExclusiveEmailIntegration(
  args: UpsertExclusiveEmailIntegrationArgs,
): Promise<string> {
  const integrationData = {
    accessToken: args.accessToken,
    refreshToken: args.refreshToken,
    tokenExpiresAt: args.tokenExpiresAt,
    fromEmail: args.externalAccountId,
    metadata: { provider: args.provider },
  };
  const key = {
    organizationId: args.organizationId,
    platform: 'email' as const,
    externalAccountId: args.externalAccountId,
  };
  const existing = await db.integration.findUnique({
    where: { organizationId_platform_externalAccountId: key },
  });
  let savedId: string;

  if (existing) {
    await db.integration.update({ where: { id: existing.id }, data: integrationData });
    savedId = existing.id;
  } else {
    try {
      const created = await db.integration.create({
        data: {
          organizationId: args.organizationId,
          platform: 'email',
          externalAccountId: args.externalAccountId,
          ...integrationData,
        },
      });
      savedId = created.id;
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const race = (await db.integration.findUnique({
        where: { organizationId_platform_externalAccountId: key },
      }))!;
      await db.integration.update({ where: { id: race.id }, data: integrationData });
      savedId = race.id;
    }
  }

  await db.integration.deleteMany({
    where: { organizationId: args.organizationId, platform: 'email', id: { not: savedId } },
  });

  return savedId;
}
