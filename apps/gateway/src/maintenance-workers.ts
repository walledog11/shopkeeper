import { Worker, Queue } from 'bullmq';
import { db } from '@clerk/db';
import * as Sentry from '@sentry/node';
import logger from './logger.js';
import { CHANNEL, QUEUE, JOB } from './constants.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 5;
const FB_GRAPH = 'https://graph.facebook.com/v22.0';
const ARCHIVE_AFTER_DAYS = 90;
const PURGE_AFTER_DAYS = 90;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function createMaintenanceWorkers(workerConn: any, producerConn: any) {
/* eslint-enable @typescript-eslint/no-explicit-any */

  // ─── Daily Instagram Token Health Check ──────────────────────────────────────

  const tokenHealthQueue = new Queue(QUEUE.TOKEN_HEALTH, { connection: producerConn });

  await tokenHealthQueue.add(
    JOB.TOKEN_HEALTH_CHECK,
    {},
    { repeat: { every: ONE_DAY_MS }, jobId: JOB.TOKEN_HEALTH_ID }
  );

  const tokenHealthWorker = new Worker(QUEUE.TOKEN_HEALTH, async () => {
    logger.info('[TokenHealth] Running daily Instagram token check');

    const igIntegrations = await db.integration.findMany({
      where: { platform: CHANNEL.IG_DM, accessToken: { not: null } },
      select: { id: true, organizationId: true, externalAccountId: true, accessToken: true, tokenExpiresAt: true },
    });

    logger.info({ count: igIntegrations.length }, '[TokenHealth] Checking ig_dm integrations');

    for (let i = 0; i < igIntegrations.length; i += CONCURRENCY) {
      await Promise.all(igIntegrations.slice(i, i + CONCURRENCY).map(async (integration) => {
        try {
          const res = await fetch(
            `${FB_GRAPH}/${integration.externalAccountId}?fields=id&access_token=${integration.accessToken}`
          );
          const data = await res.json() as { error?: { message: string } };

          if (data.error) {
            logger.error({ organizationId: integration.organizationId, accountId: integration.externalAccountId, err: data.error.message }, '[TokenHealth] Token invalid — marking as expired');
            await db.integration.update({
              where: { id: integration.id },
              data: { tokenExpiresAt: new Date(0) },
            });
            return;
          }

          const daysLeft = integration.tokenExpiresAt
            ? Math.round((new Date(integration.tokenExpiresAt).getTime() - Date.now()) / 86_400_000)
            : 'unknown';

          await db.integration.update({
            where: { id: integration.id },
            data: { tokenExpiresAt: new Date(Date.now() + 60 * ONE_DAY_MS) },
          });

          logger.info({ organizationId: integration.organizationId, daysLeft }, '[TokenHealth] Token healthy, reset to 60d');
        } catch (err) {
          logger.error({ organizationId: integration.organizationId, err: (err as Error).message }, '[TokenHealth] Failed to check token');
        }
      }));
    }

    logger.info('[TokenHealth] Daily check complete');
  }, { connection: workerConn });

  tokenHealthWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, '[TokenHealth] Job failed');
    Sentry.captureException(err, { extra: { jobId: job?.id } });
  });

  // ─── Thread Archival ──────────────────────────────────────────────────────────

  const archivalQueue = new Queue(QUEUE.ARCHIVAL, { connection: producerConn });

  await archivalQueue.add(
    JOB.ARCHIVE_THREADS,
    {},
    { repeat: { every: ONE_DAY_MS }, jobId: JOB.ARCHIVE_THREADS_ID }
  );

  const archivalWorker = new Worker(QUEUE.ARCHIVAL, async () => {
    const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * ONE_DAY_MS);
    const result = await db.thread.updateMany({
      where: { status: 'closed', archivedAt: null, deletedAt: null, updatedAt: { lt: cutoff } },
      data: { archivedAt: new Date() },
    });
    logger.info({ count: result.count, cutoffDays: ARCHIVE_AFTER_DAYS }, '[Archival] Archived old closed threads');
  }, { connection: workerConn });

  archivalWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, '[Archival] Job failed');
    Sentry.captureException(err, { extra: { jobId: job?.id } });
  });

  // ─── Hard-Delete Purge ────────────────────────────────────────────────────────

  const purgeQueue = new Queue(QUEUE.PURGE, { connection: producerConn });

  await purgeQueue.add(
    JOB.PURGE_DELETED,
    {},
    { repeat: { every: ONE_DAY_MS }, jobId: JOB.PURGE_DELETED_ID }
  );

  const purgeWorker = new Worker(QUEUE.PURGE, async () => {
    const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * ONE_DAY_MS);

    // Delete in leaf-first order to avoid FK cascade wiping records that haven't
    // reached their own retention cutoff.
    const deletedMessages = await db.message.deleteMany({ where: { deletedAt: { lt: cutoff } } });
    const deletedThreads = await db.thread.deleteMany({
      where: { deletedAt: { lt: cutoff }, messages: { none: {} } },
    });
    const deletedCustomers = await db.customer.deleteMany({
      where: { deletedAt: { lt: cutoff }, threads: { none: {} } },
    });

    logger.info(
      { messages: deletedMessages.count, threads: deletedThreads.count, customers: deletedCustomers.count, cutoffDays: PURGE_AFTER_DAYS },
      '[Purge] Hard-deleted expired soft-deleted records'
    );
  }, { connection: workerConn });

  purgeWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, '[Purge] Job failed');
    Sentry.captureException(err, { extra: { jobId: job?.id } });
  });

  return {
    workers: [tokenHealthWorker, archivalWorker, purgeWorker],
    queues: [tokenHealthQueue, archivalQueue, purgeQueue],
  };
}
