import { db } from '@shopkeeper/db';
import {
  getShopifyConnectionState,
  missingShopifyScopes,
  refreshShopifyIntegrationHealthIfDue,
} from '@/lib/server/shopify-integration';
import type { Integration } from '@/types';

function recordedShopifyScopes(metadata: unknown): string[] | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const scopes = (metadata as Record<string, unknown>).oauthScopes;
  if (!Array.isArray(scopes)) return null;
  return scopes.filter((scope): scope is string => typeof scope === 'string');
}

export function serializeIntegrationRecord<T extends {
  accessToken?: string | null;
  refreshToken?: string | null;
  createdAt?: Date;
  tokenExpiresAt?: Date | null;
  platform?: string;
  metadata?: unknown;
}>(
  integration: T,
  lastActivity?: string | null,
  threadsThisWeek?: number,
  isDefaultEmail?: boolean,
) {
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
  const recordedScopes = integration.platform === 'shopify'
    ? recordedShopifyScopes(integration.metadata)
    : null;
  const missingScopes = recordedScopes ? missingShopifyScopes(recordedScopes) : [];
  return {
    ...safe,
    ...(connectionState !== undefined && { connectionState }),
    ...(missingScopes.length > 0 && { missingScopes }),
    ...(lastActivity !== undefined && { lastActivity }),
    ...(threadsThisWeek !== undefined && { threadsThisWeek }),
    ...(isDefaultEmail !== undefined && { isDefaultEmail }),
  };
}

export async function getIntegrationsForOrg(org: {
  id: string;
  defaultEmailIntegrationId: string | null;
}): Promise<Integration[]> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [integrations, activityRows, weeklyRows, emailActivityRows, emailWeeklyThreads] = await Promise.all([
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
    db.message.groupBy({
      by: ['integrationId'],
      where: {
        organizationId: org.id,
        integrationId: { not: null },
        thread: { channelType: 'email', deletedAt: null },
      },
      _max: { sentAt: true },
    }),
    db.message.findMany({
      where: {
        organizationId: org.id,
        integrationId: { not: null },
        sentAt: { gte: weekAgo },
        thread: { channelType: 'email', deletedAt: null },
      },
      distinct: ['integrationId', 'threadId'],
      select: { integrationId: true, threadId: true },
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
  const lastActivityByIntegration = new Map(
    emailActivityRows.flatMap((row) => row.integrationId
      ? [[row.integrationId, row._max.sentAt?.toISOString() ?? null] as const]
      : []),
  );
  const weeklyByIntegration = new Map<string, number>();
  for (const row of emailWeeklyThreads) {
    if (!row.integrationId) continue;
    weeklyByIntegration.set(row.integrationId, (weeklyByIntegration.get(row.integrationId) ?? 0) + 1);
  }

  const refreshedIntegrations = await Promise.all(integrations.map(async (integration) => {
    if (integration.platform !== 'shopify') return integration;
    const tokenExpiresAt = await refreshShopifyIntegrationHealthIfDue(integration);
    if (tokenExpiresAt === integration.tokenExpiresAt) return integration;
    return { ...integration, tokenExpiresAt };
  }));

  return refreshedIntegrations.map((integration) => {
    const isEmail = integration.platform === 'email';
    const serialized = serializeIntegrationRecord(
      integration,
      isEmail
        ? lastActivityByIntegration.get(integration.id) ?? null
        : lastActivityByChannel[integration.platform] ?? null,
      isEmail
        ? weeklyByIntegration.get(integration.id) ?? 0
        : weeklyByChannel[integration.platform] ?? 0,
      isEmail ? org.defaultEmailIntegrationId === integration.id : undefined,
    );
    return {
      ...serialized,
      createdAt: serialized.createdAt?.toISOString() ?? new Date(0).toISOString(),
      tokenExpiresAt: serialized.tokenExpiresAt?.toISOString() ?? null,
    } as Integration;
  });
}
