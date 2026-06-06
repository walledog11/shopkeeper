import { db } from '@clerk/db';
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
const FB_GRAPH = 'https://graph.facebook.com/v22.0';

export async function runTokenHealthCheck(): Promise<void> {
  logger.info('[TokenHealth] Running daily Instagram token check');

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  const igIntegrations = await db.integration.findMany({
    where: { platform: CHANNEL.IG_DM, accessToken: { not: null } },
    select: { id: true, organizationId: true, externalAccountId: true, accessToken: true, refreshToken: true, tokenExpiresAt: true },
  });

  logger.info({ count: igIntegrations.length }, '[TokenHealth] Checking ig_dm integrations');

  for (let i = 0; i < igIntegrations.length; i += CONCURRENCY) {
    await Promise.all(igIntegrations.slice(i, i + CONCURRENCY).map(async (integration) => {
      try {
        const res = await fetch(
          `${FB_GRAPH}/${integration.externalAccountId}?fields=id&access_token=${integration.accessToken}`,
        );
        const data = await res.json() as { error?: { message: string } };

        if (data.error) {
          logger.error({ organizationId: integration.organizationId, accountId: integration.externalAccountId, err: data.error.message }, '[TokenHealth] Token invalid - marking as expired');
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
            const refreshRes = await fetch(
              `${FB_GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${integration.refreshToken}`,
            );
            const refreshData = await refreshRes.json() as { access_token?: string; error?: { message: string } };

            if (refreshData.access_token) {
              updateData.refreshToken = refreshData.access_token;
              logger.info({ organizationId: integration.organizationId }, '[TokenHealth] User token refreshed');
            } else {
              logger.warn({ organizationId: integration.organizationId, err: refreshData.error?.message }, '[TokenHealth] User token refresh failed - page token still valid');
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
    sentryQueue: 'token-health',
  });

  return { workers: [worker], queues: [queue] };
};
