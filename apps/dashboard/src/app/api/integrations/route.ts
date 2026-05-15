import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';
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

export async function GET() {
  try {
    const org = await getOrCreateOrg();

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
  } catch (error) {
    return handleApiError(error, 'Integrations GET', 'Failed to fetch integrations');
  }
}

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const rl = await rateLimit(`integrations:create:${org.id}`, 20, 60);
    if (!rl.success) return tooManyRequests(rl.reset);
    const { platform, externalAccountId, fromEmail } = await request.json();

    if (!platform || !externalAccountId) {
      return NextResponse.json({ error: 'Missing platform or externalAccountId' }, { status: 400 });
    }

    if (!Object.values(CHANNEL_TYPE).includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    if (platform === CHANNEL_TYPE.EMAIL) {
      const normalizedEmail = String(externalAccountId).trim().toLowerCase();
      if (!normalizedEmail) {
        return NextResponse.json({ error: 'Missing platform or externalAccountId' }, { status: 400 });
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
  } catch (error) {
    return handleApiError(error, 'Integrations POST', 'Failed to create integration');
  }
}
