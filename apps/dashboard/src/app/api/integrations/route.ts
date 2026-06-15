import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { parseCreateIntegrationBody } from '@/app/api/integrations/_lib/validation';
import { CHANNEL_TYPE } from '@shopkeeper/agent/thread-constants';
import {
  getShopifyConnectionState,
  refreshShopifyIntegrationHealthIfDue,
} from '@/lib/server/shopify-integration';
import { saveForwardingEmailIntegration } from './_lib/email-integration';
import { upsertRaceSafeIntegration } from './_lib/integration-upsert';

export const dynamic = 'force-dynamic';

function serializeIntegration<T extends {
  accessToken?: string | null;
  refreshToken?: string | null;
  createdAt?: Date;
  tokenExpiresAt?: Date | null;
  platform?: string;
}>(integration: T, lastActivity?: string | null, threadsThisWeek?: number) {
  const safe = { ...integration } as Omit<T, 'accessToken' | 'refreshToken'> & {
    accessToken?: string | null;
    refreshToken?: string | null;
  };
  delete safe.accessToken;
  delete safe.refreshToken;
  const connectionState = integration.platform === 'shopify'
    ? getShopifyConnectionState({
        accessToken: integration.accessToken ?? null,
        tokenExpiresAt: integration.tokenExpiresAt ?? null,
      })
    : undefined;
  return {
    ...safe,
    ...(connectionState !== undefined && { connectionState }),
    ...(lastActivity !== undefined && { lastActivity }),
    ...(threadsThisWeek !== undefined && { threadsThisWeek }),
  };
}

export const GET = withOrgRoute(
  { context: 'Integrations GET', errorMessage: 'Failed to fetch integrations' },
  async ({ org }) => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [integrations, activityRows, weeklyRows] = await Promise.all([
      db.integration.findMany({
        where: { organizationId: org.id },
        orderBy: { createdAt: 'asc' },
      }),
      db.thread.groupBy({
        by: ['channelType'],
        where: { organizationId: org.id, deletedAt: null },
        _max: { updatedAt: true },
      }),
      db.thread.groupBy({
        by: ['channelType'],
        where: { organizationId: org.id, deletedAt: null, createdAt: { gte: weekAgo } },
        _count: { _all: true },
      }),
    ]);

    const lastActivityByChannel: Record<string, string | null> = {};
    for (const row of activityRows) {
      lastActivityByChannel[row.channelType] = row._max.updatedAt?.toISOString() ?? null;
    }
    const weeklyByChannel: Record<string, number> = {};
    for (const row of weeklyRows) {
      weeklyByChannel[row.channelType] = row._count._all;
    }

    const refreshedIntegrations = await Promise.all(integrations.map(async (integration) => {
      if (integration.platform !== 'shopify') return integration;
      const tokenExpiresAt = await refreshShopifyIntegrationHealthIfDue(integration);
      if (tokenExpiresAt === integration.tokenExpiresAt) return integration;
      return { ...integration, tokenExpiresAt };
    }));

    const result = refreshedIntegrations.map(i => serializeIntegration(
      i,
      lastActivityByChannel[i.platform] ?? null,
      weeklyByChannel[i.platform] ?? 0,
    ));

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);

export const POST = withOrgRoute(
  {
    context: 'Integrations POST',
    errorMessage: 'Failed to create integration',
    rateLimit: { key: 'integrations:create', limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { platform, externalAccountId, fromEmail } = parseCreateIntegrationBody(await readRequiredJsonObject(request));
    const platformValue = platform;

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
