import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { CHANNEL_TYPE } from '@/lib/messaging/thread-constants';

function serializeIntegration<T extends {
  accessToken?: string | null;
  refreshToken?: string | null;
  createdAt?: Date;
  tokenExpiresAt?: Date | null;
}>(integration: T, lastActivity?: string | null) {
  const safe = { ...integration } as Omit<T, 'accessToken' | 'refreshToken'> & {
    accessToken?: string | null;
    refreshToken?: string | null;
  };
  delete safe.accessToken;
  delete safe.refreshToken;
  return {
    ...safe,
    ...(lastActivity !== undefined && { lastActivity }),
  };
}

export const GET = withOrgRoute(
  { context: 'Integrations GET', errorMessage: 'Failed to fetch integrations' },
  async ({ org }) => {
    const [integrations, activityRows] = await Promise.all([
      db.integration.findMany({
        where: { organizationId: org.id },
        orderBy: { createdAt: 'asc' },
      }),
      db.thread.groupBy({
        by: ['channelType'],
        where: { organizationId: org.id, deletedAt: null },
        _max: { updatedAt: true },
      }),
    ]);

    const lastActivityByChannel: Record<string, string | null> = {};
    for (const row of activityRows) {
      lastActivityByChannel[row.channelType] = row._max.updatedAt?.toISOString() ?? null;
    }

    const result = integrations.map(i => serializeIntegration(i, lastActivityByChannel[i.platform] ?? null));

    return NextResponse.json(result);
  },
);

export const POST = withOrgRoute(
  {
    context: 'Integrations POST',
    errorMessage: 'Failed to create integration',
    rateLimit: { key: 'integrations:create', limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { platform, externalAccountId, fromEmail } = await request.json();

    if (!platform || !externalAccountId) {
      throw new BadRequestError('Missing platform or externalAccountId');
    }

    if (!Object.values(CHANNEL_TYPE).includes(platform)) {
      throw new BadRequestError('Invalid platform');
    }

    if (platform === CHANNEL_TYPE.EMAIL) {
      const normalizedEmail = String(externalAccountId).trim().toLowerCase();
      if (!normalizedEmail) {
        throw new BadRequestError('Missing platform or externalAccountId');
      }
      const normalizedFromEmail = fromEmail === undefined || fromEmail === null
        ? normalizedEmail
        : String(fromEmail).trim().toLowerCase() || normalizedEmail;

      const emailRows = await db.integration.findMany({
        where: { organizationId: org.id, platform: CHANNEL_TYPE.EMAIL },
        orderBy: { createdAt: 'asc' },
      });
      const keeper = emailRows.find(row => row.externalAccountId.toLowerCase() === normalizedEmail) ?? emailRows[0];

      let integration;
      if (keeper) {
        await db.integration.deleteMany({
          where: { organizationId: org.id, platform: CHANNEL_TYPE.EMAIL, id: { not: keeper.id } },
        });
        integration = await db.integration.update({
          where: { id: keeper.id },
          data: {
            externalAccountId: normalizedEmail,
            fromEmail: normalizedFromEmail,
            accessToken: null,
            refreshToken: null,
            tokenExpiresAt: null,
            metadata: { provider: 'postmark' },
          },
        });
      } else {
        try {
          integration = await db.integration.create({
            data: {
              organizationId: org.id,
              platform: CHANNEL_TYPE.EMAIL,
              externalAccountId: normalizedEmail,
              fromEmail: normalizedFromEmail,
              metadata: { provider: 'postmark' },
            },
          });
        } catch (err) {
          if ((err as { code?: string }).code !== 'P2002') throw err;
          const race = (await db.integration.findFirst({
            where: { organizationId: org.id, platform: CHANNEL_TYPE.EMAIL },
            orderBy: { createdAt: 'asc' },
          }))!;
          await db.integration.deleteMany({
            where: { organizationId: org.id, platform: CHANNEL_TYPE.EMAIL, id: { not: race.id } },
          });
          integration = await db.integration.update({
            where: { id: race.id },
            data: {
              externalAccountId: normalizedEmail,
              fromEmail: normalizedFromEmail,
              accessToken: null,
              refreshToken: null,
              tokenExpiresAt: null,
              metadata: { provider: 'postmark' },
            },
          });
        }
      }

      return NextResponse.json(serializeIntegration(integration), { status: 201 });
    }

    const uniqueKey = { organizationId: org.id, platform, externalAccountId };
    let existing = await db.integration.findUnique({
      where: { organizationId_platform_externalAccountId: uniqueKey },
    });
    let integration;
    if (existing) {
      integration = await db.integration.update({
        where: { id: existing.id },
        data: { ...(fromEmail !== undefined && { fromEmail }) },
      });
    } else {
      try {
        integration = await db.integration.create({
          data: { organizationId: org.id, platform, externalAccountId, ...(fromEmail && { fromEmail }) },
        });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        existing = (await db.integration.findUnique({ where: { organizationId_platform_externalAccountId: uniqueKey } }))!;
        integration = await db.integration.update({ where: { id: existing.id }, data: { ...(fromEmail !== undefined && { fromEmail }) } });
      }
    }

    return NextResponse.json(serializeIntegration(integration), { status: 201 });
  },
);
