import { db } from '@shopkeeper/db';
import {
  checkInstagramAccountAccess,
  exchangeFacebookLongLivedToken,
} from '../clients/meta-graph.js';
import { refreshTikTokShopAccessToken } from '../clients/tiktok-shop.js';
import { getMetaWebhookConfig, getTikTokShopApiConfig } from '../config/runtime-config.js';
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
const TIKTOK_REFRESH_WINDOW_MS = 7 * ONE_DAY_MS;
const EPOCH_SENTINEL = new Date(0);

export async function runTokenHealthCheck(): Promise<void> {
  logger.info('[TokenHealth] Running daily Instagram token check');

  const { appId, appSecret } = getMetaWebhookConfig();

  const igIntegrations = await db.integration.findMany({
    where: { platform: CHANNEL.IG_DM, accessToken: { not: null } },
    select: { id: true, organizationId: true, externalAccountId: true, accessToken: true, refreshToken: true, tokenExpiresAt: true },
  });

  logger.info({ count: igIntegrations.length }, '[TokenHealth] Checking ig_dm integrations');

  for (let i = 0; i < igIntegrations.length; i += CONCURRENCY) {
    await Promise.all(igIntegrations.slice(i, i + CONCURRENCY).map(async (integration) => {
      try {
        if (!integration.accessToken) return;

        const check = await checkInstagramAccountAccess(
          integration.externalAccountId,
          integration.accessToken,
        );

        if (check.error) {
          logger.error({ organizationId: integration.organizationId, accountId: integration.externalAccountId, err: check.error.message }, '[TokenHealth] Token invalid - marking as expired');
          if (integration.tokenExpiresAt?.getTime() !== 0) {
            await db.integration.update({
              where: { id: integration.id },
              data: { tokenExpiresAt: new Date(0) },
            });
          }
          return;
        }

        const nowMs = Date.now();
        const updateData: { tokenExpiresAt: Date; refreshToken?: string } = {
          tokenExpiresAt: new Date(nowMs + 60 * ONE_DAY_MS),
        };

        if (integration.refreshToken && appId && appSecret) {
          try {
            const refresh = await exchangeFacebookLongLivedToken(
              appId,
              appSecret,
              integration.refreshToken,
            );

            if (refresh.data?.access_token) {
              updateData.refreshToken = refresh.data.access_token;
              logger.info({ organizationId: integration.organizationId }, '[TokenHealth] User token refreshed');
            } else {
              logger.warn({ organizationId: integration.organizationId, err: refresh.error?.message }, '[TokenHealth] User token refresh failed - page token still valid');
            }
          } catch (refreshErr) {
            logger.warn({ organizationId: integration.organizationId, err: (refreshErr as Error).message }, '[TokenHealth] User token refresh error - page token still valid');
          }
        }

        await db.integration.update({
          where: { id: integration.id },
          data: updateData,
        });

        const daysLeft = integration.tokenExpiresAt
          ? Math.round((integration.tokenExpiresAt.getTime() - nowMs) / ONE_DAY_MS)
          : 'unknown';

        logger.info({ organizationId: integration.organizationId, daysLeft, refreshed: !!updateData.refreshToken }, '[TokenHealth] Token healthy, reset to 60d');
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
