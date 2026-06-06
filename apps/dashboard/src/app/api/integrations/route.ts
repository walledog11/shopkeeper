import { NextResponse } from 'next/server';
import { db, type DbChannelType } from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { CHANNEL_TYPE } from '@clerk/agent/thread-constants';
import { saveForwardingEmailIntegration } from './_lib/email-integration';
import { upsertRaceSafeIntegration } from './_lib/integration-upsert';

type ChannelTypeValue = (typeof CHANNEL_TYPE)[keyof typeof CHANNEL_TYPE];

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

    if (typeof platform !== 'string' || !Object.values(CHANNEL_TYPE).includes(platform as ChannelTypeValue)) {
      throw new BadRequestError('Invalid platform');
    }
    const platformValue = platform as DbChannelType;

    if (platformValue === CHANNEL_TYPE.EMAIL) {
      const normalizedEmail = String(externalAccountId).trim().toLowerCase();
      if (!normalizedEmail) {
        throw new BadRequestError('Missing platform or externalAccountId');
      }
      const normalizedFromEmail = fromEmail === undefined || fromEmail === null
        ? normalizedEmail
        : String(fromEmail).trim().toLowerCase() || normalizedEmail;

      const integration = await saveForwardingEmailIntegration({
        organizationId: org.id,
        externalAccountId: normalizedEmail,
        fromEmail: normalizedFromEmail,
      });

      return NextResponse.json(serializeIntegration(integration), { status: 201 });
    }

    const integration = await upsertRaceSafeIntegration({
      organizationId: org.id,
      platform: platformValue,
      externalAccountId: String(externalAccountId),
      data: {
        ...(fromEmail !== undefined && { fromEmail: fromEmail === null ? null : String(fromEmail) }),
      },
    });

    return NextResponse.json(serializeIntegration(integration), { status: 201 });
  },
);
