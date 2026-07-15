import type { Prisma } from '@prisma/client';
import { db } from '@shopkeeper/db';
import {
  fetchConnectedInstagramAccount,
  fetchInstagramMessageSubscription,
  refreshInstagramAccessToken,
  type InstagramProviderError,
} from '../clients/instagram-graph.js';
import { refreshTikTokShopAccessToken } from '../clients/tiktok-shop.js';
import { getTikTokShopApiConfig } from '../config/runtime-config.js';
import { CHANNEL, JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_DAY_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

const CONCURRENCY = 5;
const INSTAGRAM_REFRESH_WINDOW_MS = 7 * ONE_DAY_MS;
const INSTAGRAM_MIN_REFRESH_AGE_MS = ONE_DAY_MS;
const TIKTOK_REFRESH_WINDOW_MS = 7 * ONE_DAY_MS;
const EPOCH_SENTINEL = new Date(0);

type InstagramHealthStatus = 'healthy' | 'degraded' | 'reconnect_required';

interface InstagramIntegrationRow {
  accessToken: string | null;
  createdAt: Date;
  externalAccountId: string;
  id: string;
  metadata: unknown;
  organizationId: string;
  tokenExpiresAt: Date | null;
}

interface InstagramHealthError {
  category: InstagramProviderError['category'];
  code: string | number | null;
  httpStatus: number;
  requestId: string | null;
  subcode: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function instagramMetadata(metadata: unknown): Record<string, unknown> {
  if (!isRecord(metadata) || !isRecord(metadata.instagram)) return {};
  return metadata.instagram;
}

function tokenIssuedAtMs(integration: InstagramIntegrationRow): number {
  const instagram = instagramMetadata(integration.metadata);
  return readTimestamp(instagram.accessTokenIssuedAt)
    ?? readTimestamp(instagram.lastRefreshAt)
    ?? integration.createdAt.getTime();
}

function providerHealthError(error: InstagramProviderError): InstagramHealthError {
  return {
    category: error.category,
    code: error.code,
    httpStatus: error.httpStatus,
    requestId: error.requestId,
    subcode: error.subcode,
  };
}

function localHealthError(
  code: string,
  category: InstagramProviderError['category'] = 'validation',
): InstagramHealthError {
  return { category, code, httpStatus: 0, requestId: null, subcode: null };
}

function mergeInstagramHealthMetadata(
  metadata: unknown,
  input: {
    error: InstagramHealthError | null;
    now: Date;
    status: InstagramHealthStatus;
    subscriptionFields?: string[];
    successful?: boolean;
    tokenRefreshed?: boolean;
  },
): Prisma.InputJsonObject {
  const root = isRecord(metadata) ? { ...metadata } : {};
  const current = instagramMetadata(metadata);
  const checkedAt = input.now.toISOString();
  return {
    ...root,
    instagram: {
      ...current,
      healthStatus: input.status,
      lastHealthCheckAt: checkedAt,
      lastHealthError: input.error,
      ...(input.successful ? { lastSuccessfulHealthCheckAt: checkedAt } : {}),
      ...(input.subscriptionFields !== undefined
        ? {
            lastSubscriptionCheckAt: checkedAt,
            subscribedFields: input.subscriptionFields,
            ...(input.subscriptionFields.includes('messages')
              ? { lastSuccessfulSubscriptionAt: checkedAt }
              : {}),
          }
        : {}),
      ...(input.tokenRefreshed
        ? { accessTokenIssuedAt: checkedAt, lastRefreshAt: checkedAt }
        : {}),
    },
  } as Prisma.InputJsonObject;
}

function isReconnectRequired(error: InstagramProviderError): boolean {
  return error.category === 'authentication' || error.category === 'permission';
}

function logInstagramProviderFailure(
  integration: InstagramIntegrationRow,
  operation: string,
  error: InstagramProviderError,
): void {
  const log = isReconnectRequired(error) ? logger.error.bind(logger) : logger.warn.bind(logger);
  log(
    {
      accountId: integration.externalAccountId,
      category: error.category,
      code: error.code,
      httpStatus: error.httpStatus,
      organizationId: integration.organizationId,
      requestId: error.requestId,
      subcode: error.subcode,
    },
    `[TokenHealth] Instagram ${operation} failed`,
  );
}

async function recordInstagramProviderFailure(
  integration: InstagramIntegrationRow,
  now: Date,
  operation: string,
  error: InstagramProviderError,
  subscriptionFields?: string[],
): Promise<void> {
  logInstagramProviderFailure(integration, operation, error);
  const reconnectRequired = isReconnectRequired(error);
  await db.integration.update({
    where: { id: integration.id },
    data: {
      metadata: mergeInstagramHealthMetadata(integration.metadata, {
        error: providerHealthError(error),
        now,
        status: reconnectRequired ? 'reconnect_required' : 'degraded',
        ...(subscriptionFields ? { subscriptionFields } : {}),
      }),
      refreshToken: null,
      ...(error.category === 'authentication' ? { tokenExpiresAt: EPOCH_SENTINEL } : {}),
    },
  });
}

async function checkInstagramIntegration(
  integration: InstagramIntegrationRow,
  now: Date,
): Promise<void> {
  if (!integration.accessToken || integration.tokenExpiresAt?.getTime() === 0) return;

  const nowMs = now.getTime();
  if (integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() <= nowMs) {
    await db.integration.update({
      where: { id: integration.id },
      data: {
        metadata: mergeInstagramHealthMetadata(integration.metadata, {
          error: localHealthError('stored_token_expired', 'authentication'),
          now,
          status: 'reconnect_required',
        }),
        refreshToken: null,
        tokenExpiresAt: EPOCH_SENTINEL,
      },
    });
    return;
  }

  const account = await fetchConnectedInstagramAccount(integration.accessToken);
  if (!account.ok) {
    await recordInstagramProviderFailure(integration, now, 'account probe', account.error);
    return;
  }
  if (account.data.userId !== integration.externalAccountId) {
    logger.error(
      {
        accountId: integration.externalAccountId,
        integrationId: integration.id,
        organizationId: integration.organizationId,
        providerAccountId: account.data.userId,
      },
      '[TokenHealth] Instagram account identity changed',
    );
    await db.integration.update({
      where: { id: integration.id },
      data: {
        metadata: mergeInstagramHealthMetadata(integration.metadata, {
          error: localHealthError('account_identity_mismatch'),
          now,
          status: 'reconnect_required',
        }),
        refreshToken: null,
      },
    });
    return;
  }

  const subscription = await fetchInstagramMessageSubscription(
    integration.externalAccountId,
    integration.accessToken,
  );
  if (!subscription.ok) {
    await recordInstagramProviderFailure(integration, now, 'subscription probe', subscription.error);
    return;
  }
  if (!subscription.data.messagesActive) {
    logger.error(
      {
        accountId: integration.externalAccountId,
        integrationId: integration.id,
        organizationId: integration.organizationId,
        subscribedFields: subscription.data.fields,
      },
      '[TokenHealth] Instagram messages subscription is inactive',
    );
    await db.integration.update({
      where: { id: integration.id },
      data: {
        metadata: mergeInstagramHealthMetadata(integration.metadata, {
          error: localHealthError('messages_subscription_missing', 'permission'),
          now,
          status: 'reconnect_required',
          subscriptionFields: subscription.data.fields,
        }),
        refreshToken: null,
      },
    });
    return;
  }

  if (!integration.tokenExpiresAt) {
    await db.integration.update({
      where: { id: integration.id },
      data: {
        metadata: mergeInstagramHealthMetadata(integration.metadata, {
          error: localHealthError('token_expiry_missing'),
          now,
          status: 'degraded',
          subscriptionFields: subscription.data.fields,
        }),
        refreshToken: null,
      },
    });
    return;
  }

  const shouldRefresh = integration.tokenExpiresAt.getTime() - nowMs <= INSTAGRAM_REFRESH_WINDOW_MS
    && nowMs - tokenIssuedAtMs(integration) >= INSTAGRAM_MIN_REFRESH_AGE_MS;
  if (!shouldRefresh) {
    await db.integration.update({
      where: { id: integration.id },
      data: {
        metadata: mergeInstagramHealthMetadata(integration.metadata, {
          error: null,
          now,
          status: 'healthy',
          subscriptionFields: subscription.data.fields,
          successful: true,
        }),
        refreshToken: null,
      },
    });
    return;
  }

  const refreshed = await refreshInstagramAccessToken(integration.accessToken);
  if (!refreshed.ok) {
    await recordInstagramProviderFailure(
      integration,
      now,
      'token refresh',
      refreshed.error,
      subscription.data.fields,
    );
    return;
  }

  await db.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: refreshed.data.accessToken,
      metadata: mergeInstagramHealthMetadata(integration.metadata, {
        error: null,
        now,
        status: 'healthy',
        subscriptionFields: subscription.data.fields,
        successful: true,
        tokenRefreshed: true,
      }),
      refreshToken: null,
      tokenExpiresAt: new Date(nowMs + refreshed.data.expiresIn * 1000),
    },
  });
  logger.info(
    {
      accountId: integration.externalAccountId,
      organizationId: integration.organizationId,
      tokenExpiresAt: new Date(nowMs + refreshed.data.expiresIn * 1000).toISOString(),
    },
    '[TokenHealth] Instagram token refreshed',
  );
}

export async function runTokenHealthCheck(): Promise<void> {
  logger.info('[TokenHealth] Running daily Instagram token check');
  const now = new Date();

  const igIntegrations = await db.integration.findMany({
    where: {
      platform: CHANNEL.IG_DM,
      accessToken: { not: null },
      metadata: { path: ['instagram', 'authModel'], equals: 'instagram_login' },
    },
    select: {
      id: true,
      organizationId: true,
      externalAccountId: true,
      accessToken: true,
      createdAt: true,
      metadata: true,
      tokenExpiresAt: true,
    },
  });

  logger.info({ count: igIntegrations.length }, '[TokenHealth] Checking ig_dm integrations');

  for (let i = 0; i < igIntegrations.length; i += CONCURRENCY) {
    await Promise.all(igIntegrations.slice(i, i + CONCURRENCY).map(async (integration) => {
      try {
        await checkInstagramIntegration(integration, now);
      } catch (err) {
        logger.error({ organizationId: integration.organizationId, err: (err as Error).message }, '[TokenHealth] Failed to check token');
      }
    }));
  }

  logger.info('[TokenHealth] Daily check complete');

  await runTikTokShopTokenRefresh();
}

async function runTikTokShopTokenRefresh(): Promise<void> {
  logger.info('[TokenHealth] Running TikTok Shop token refresh');

  const config = getTikTokShopApiConfig();
  if (!config.enabled || !config.appKey || !config.appSecret || !config.refreshTokenUrl) {
    logger.info('[TokenHealth] TikTok Shop token refresh not configured — skipping');
    return;
  }

  const now = Date.now();
  const tiktokIntegrations = await db.integration.findMany({
    where: { platform: CHANNEL.TIKTOK, refreshToken: { not: null } },
    select: {
      id: true,
      organizationId: true,
      externalAccountId: true,
      metadata: true,
      refreshToken: true,
      tokenExpiresAt: true,
    },
  });

  const expiringIntegrations = tiktokIntegrations.filter((integration) => {
    if (integration.tokenExpiresAt?.getTime() === 0) return false;
    if (!integration.tokenExpiresAt) return true;
    return integration.tokenExpiresAt.getTime() - now <= TIKTOK_REFRESH_WINDOW_MS;
  });

  logger.info(
    { count: expiringIntegrations.length, total: tiktokIntegrations.length },
    '[TokenHealth] Checking TikTok Shop integrations',
  );

  for (let i = 0; i < expiringIntegrations.length; i += CONCURRENCY) {
    await Promise.all(
      expiringIntegrations.slice(i, i + CONCURRENCY).map(async (integration) => {
        if (!integration.refreshToken) return;
        try {
          const refreshed = await refreshTikTokShopAccessToken(config, integration.refreshToken);
          await db.integration.update({
            where: { id: integration.id },
            data: {
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken ?? integration.refreshToken,
              tokenExpiresAt: refreshed.tokenExpiresAt,
              metadata: mergeTikTokShopMetadata(integration.metadata, {
                lastRefreshAt: new Date().toISOString(),
                lastRefreshError: null,
              }),
            },
          });
          logger.info(
            { organizationId: integration.organizationId, accountId: integration.externalAccountId },
            '[TokenHealth] TikTok Shop token refreshed',
          );
        } catch (err) {
          const expiresAtMs = integration.tokenExpiresAt?.getTime() ?? 0;
          await db.integration.update({
            where: { id: integration.id },
            data: {
              ...(expiresAtMs > 0 && expiresAtMs < now ? { tokenExpiresAt: EPOCH_SENTINEL } : {}),
              metadata: mergeTikTokShopMetadata(integration.metadata, {
                lastRefreshError: err instanceof Error ? err.message : String(err),
                lastRefreshErrorAt: new Date().toISOString(),
              }),
            },
          });
          logger.error(
            {
              organizationId: integration.organizationId,
              accountId: integration.externalAccountId,
              err: err instanceof Error ? err.message : String(err),
            },
            '[TokenHealth] TikTok Shop token refresh failed',
          );
        }
      }),
    );
  }
}

function mergeTikTokShopMetadata(
  metadata: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const root = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
  const current = root.tiktokShop && typeof root.tiktokShop === 'object' && !Array.isArray(root.tiktokShop)
    ? root.tiktokShop as Record<string, unknown>
    : {};
  return { ...root, tiktokShop: { ...current, ...patch } };
}

export const registerTokenHealthMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.TOKEN_HEALTH);
  await scheduleRepeatableJob(queue, JOB.TOKEN_HEALTH_CHECK, JOB.TOKEN_HEALTH_ID, ONE_DAY_MS);

  const worker = createMaintenanceWorker(context, QUEUE.TOKEN_HEALTH, runTokenHealthCheck, {
    label: 'TokenHealth',
    failureQueue: 'token-health',
  });

  return { workers: [worker], queues: [queue] };
};
