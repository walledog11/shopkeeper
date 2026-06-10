import { db } from '@shopkeeper/db';
import {
  checkInstagramAccountAccess,
  exchangeFacebookLongLivedToken,
} from '../clients/meta-graph.js';
import { getMetaWebhookConfig } from '../config/runtime-config.js';
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
