import { Worker, Queue, type ConnectionOptions, type WorkerOptions } from 'bullmq';
import { db } from '@clerk/db';
import * as Sentry from '@sentry/node';
import logger from '../logger.js';
import { CHANNEL, QUEUE, JOB, PROCESSING_QUEUE_DEFAULTS } from '../constants.js';
import { notifyOperator } from '../operator-notify.js';
import type { CustomerMemoryJobData } from '../types.js';
import { buildOrgDigest, shouldSendDigest } from './digest.js';
import { refreshStaleCustomerMemory, updateCustomerMemoryOnThreadClose } from './customer-memory.js';
import {
  FILTERED_PURGE_AFTER_DAYS,
  purgeFilteredThreads,
} from './purge.js';
import { checkGatewayQueueHealth } from './queue-health.js';
import { runVoiceSynthesis } from './voice-synthesis.js';
import { runOrderRiskMonitor } from './order-risk-monitor.js';
import type { OpsAlertCounterClient } from '../ops-alerts.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const CONCURRENCY = 5;
const FB_GRAPH = 'https://graph.facebook.com/v22.0';
const ARCHIVE_AFTER_DAYS = 90;
const PURGE_AFTER_DAYS = 90;

async function scheduleRepeatableJob(
  queue: Queue,
  name: string,
  jobId: string,
  everyMs: number,
): Promise<void> {
  await queue.add(name, {}, { repeat: { every: everyMs }, jobId });
}

function registerWorkerFailure(worker: Worker, label: string, sentryQueue: string): void {
  worker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, `[${label}] Job failed`);
    Sentry.captureException(err, { extra: { jobId: job?.id, queue: sentryQueue, attemptsMade: job?.attemptsMade } });
  });
}

type SharedWorkerOptions = Pick<WorkerOptions, 'drainDelay' | 'stalledInterval'>;
type ProducerConnection = ConnectionOptions & OpsAlertCounterClient;

export async function createMaintenanceWorkers(
  workerConn: ConnectionOptions,
  producerConn: ProducerConnection,
  workerOptions: SharedWorkerOptions,
) {
  const tokenHealthQueue = new Queue(QUEUE.TOKEN_HEALTH, { connection: producerConn });
  await scheduleRepeatableJob(tokenHealthQueue, JOB.TOKEN_HEALTH_CHECK, JOB.TOKEN_HEALTH_ID, ONE_DAY_MS);

  const tokenHealthWorker = new Worker(QUEUE.TOKEN_HEALTH, async () => {
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
            logger.error({ organizationId: integration.organizationId, accountId: integration.externalAccountId, err: data.error.message }, '[TokenHealth] Token invalid — marking as expired');
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
                logger.warn({ organizationId: integration.organizationId, err: refreshData.error?.message }, '[TokenHealth] User token refresh failed — page token still valid');
              }
            } catch (refreshErr) {
              logger.warn({ organizationId: integration.organizationId, err: (refreshErr as Error).message }, '[TokenHealth] User token refresh error — page token still valid');
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
  }, { connection: workerConn, ...workerOptions });
  registerWorkerFailure(tokenHealthWorker, 'TokenHealth', 'token-health');

  const customerMemoryQueue = new Queue<CustomerMemoryJobData>(QUEUE.CUSTOMER_MEMORY, {
    connection: producerConn,
    defaultJobOptions: PROCESSING_QUEUE_DEFAULTS,
  });

  const customerMemoryWorker = new Worker<CustomerMemoryJobData>(QUEUE.CUSTOMER_MEMORY, async (job) => {
    await updateCustomerMemoryOnThreadClose(job.data.threadId, {
      closedAt: job.data.closedAt,
      organizationId: job.data.organizationId,
    });
  }, { connection: workerConn, ...workerOptions });
  registerWorkerFailure(customerMemoryWorker, 'CustomerMemory', 'customer-memory');

  const customerMemoryRefreshQueue = new Queue(QUEUE.CUSTOMER_MEMORY_REFRESH, {
    connection: producerConn,
    defaultJobOptions: PROCESSING_QUEUE_DEFAULTS,
  });
  await scheduleRepeatableJob(
    customerMemoryRefreshQueue,
    JOB.REFRESH_STALE_CUSTOMER_MEMORY,
    JOB.REFRESH_STALE_CUSTOMER_MEMORY_ID,
    ONE_DAY_MS,
  );

  const customerMemoryRefreshWorker = new Worker(QUEUE.CUSTOMER_MEMORY_REFRESH, async () => {
    const result = await refreshStaleCustomerMemory();
    logger.info(result, '[CustomerMemory] Stale refresh complete');
  }, { connection: workerConn, ...workerOptions });
  registerWorkerFailure(customerMemoryRefreshWorker, 'CustomerMemoryRefresh', 'customer-memory-refresh');

  const archivalQueue = new Queue(QUEUE.ARCHIVAL, { connection: producerConn });
  await scheduleRepeatableJob(archivalQueue, JOB.ARCHIVE_THREADS, JOB.ARCHIVE_THREADS_ID, ONE_DAY_MS);

  const archivalWorker = new Worker(QUEUE.ARCHIVAL, async () => {
    const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * ONE_DAY_MS);
    const result = await db.thread.updateMany({
      where: { status: 'closed', archivedAt: null, deletedAt: null, updatedAt: { lt: cutoff } },
      data: { archivedAt: new Date() },
    });
    logger.info({ count: result.count, cutoffDays: ARCHIVE_AFTER_DAYS }, '[Archival] Archived old closed threads');
  }, { connection: workerConn, ...workerOptions });
  registerWorkerFailure(archivalWorker, 'Archival', 'thread-archival');

  const purgeQueue = new Queue(QUEUE.PURGE, { connection: producerConn });
  await scheduleRepeatableJob(purgeQueue, JOB.PURGE_DELETED, JOB.PURGE_DELETED_ID, ONE_DAY_MS);

  const purgeWorker = new Worker(QUEUE.PURGE, async () => {
    const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * ONE_DAY_MS);

    const deletedMessages = await db.message.deleteMany({ where: { deletedAt: { lt: cutoff } } });
    const deletedThreads = await db.thread.deleteMany({
      where: { deletedAt: { lt: cutoff }, messages: { none: {} } },
    });
    const deletedCustomers = await db.customer.deleteMany({
      where: { deletedAt: { lt: cutoff }, threads: { none: {} } },
    });

    logger.info(
      { messages: deletedMessages.count, threads: deletedThreads.count, customers: deletedCustomers.count, cutoffDays: PURGE_AFTER_DAYS },
      '[Purge] Hard-deleted expired soft-deleted records',
    );

    const filteredPurged = await purgeFilteredThreads(new Date());
    logger.info(
      { count: filteredPurged, cutoffDays: FILTERED_PURGE_AFTER_DAYS },
      '[Purge] Hard-deleted aged filtered threads',
    );
  }, { connection: workerConn, ...workerOptions });
  registerWorkerFailure(purgeWorker, 'Purge', 'purge');

  const digestQueue = new Queue(QUEUE.DIGEST, { connection: producerConn });
  await scheduleRepeatableJob(digestQueue, JOB.DIGEST, JOB.DIGEST_ID, ONE_HOUR_MS);

  const digestWorker = new Worker(QUEUE.DIGEST, async () => {
    const now = new Date();
    const nowMs = now.getTime();
    const currentHourUtc = now.getUTCHours();

    const orgs = await db.organization.findMany({
      where: { members: { some: { telegramChatId: { not: null } } } },
      select: {
        id: true,
        settings: true,
        members: {
          where: { telegramChatId: { not: null } },
          select: { telegramChatId: true },
        },
      },
    });

    const eligibleOrgs = orgs.filter(org => {
      const settings = (org.settings as Record<string, unknown> | null) ?? {};
      return settings.digestEnabled === true && shouldSendDigest(settings, currentHourUtc, nowMs);
    });

    if (eligibleOrgs.length === 0) return;

    for (const org of eligibleOrgs) {
      const digest = await buildOrgDigest(org.id, now);
      if (!digest) continue;

      for (const member of org.members) {
        const result = await notifyOperator(org.id, member, digest.message, {
          pendingDigest: digest.pendingDigest,
        });
        if (result) {
          logger.info(
            { organizationId: org.id, chatId: result.chatId, flagged: digest.flaggedCount },
            '[Digest] Sent digest',
          );
        }
      }
    }
  }, { connection: workerConn, ...workerOptions });
  registerWorkerFailure(digestWorker, 'Digest', 'whatsapp-digest');

  const voiceSynthesisQueue = new Queue(QUEUE.VOICE_SYNTHESIS, { connection: producerConn });
  await scheduleRepeatableJob(voiceSynthesisQueue, JOB.VOICE_SYNTHESIS, JOB.VOICE_SYNTHESIS_ID, ONE_DAY_MS);

  const voiceSynthesisWorker = new Worker(QUEUE.VOICE_SYNTHESIS, async () => {
    const result = await runVoiceSynthesis();
    logger.info(result, '[VoiceSynthesis] Daily brand-voice synthesis complete');
  }, { connection: workerConn, ...workerOptions });
  registerWorkerFailure(voiceSynthesisWorker, 'VoiceSynthesis', 'voice-synthesis');

  // Track 4 spike: thread-less fraud-risk monitor. Gated by ORDER_RISK_MONITOR_ENABLED
  // inside runOrderRiskMonitor - the queue/worker exist but the scan is a no-op unless
  // the flag is set, so it never runs for merchants.
  const orderRiskQueue = new Queue(QUEUE.ORDER_RISK, { connection: producerConn });
  await scheduleRepeatableJob(orderRiskQueue, JOB.ORDER_RISK_SCAN, JOB.ORDER_RISK_ID, ONE_HOUR_MS);

  const orderRiskWorker = new Worker(QUEUE.ORDER_RISK, async () => {
    const result = await runOrderRiskMonitor();
    if (result.ordersReviewed > 0) {
      logger.info(result, '[OrderRiskMonitor] Scan complete');
    }
  }, { connection: workerConn, ...workerOptions });
  registerWorkerFailure(orderRiskWorker, 'OrderRiskMonitor', 'order-risk-monitor');

  const queueHealthQueue = new Queue(QUEUE.QUEUE_HEALTH, { connection: producerConn });
  const queueHealthInboundQueue = new Queue(QUEUE.INBOUND, { connection: producerConn });
  const queueHealthSummaryQueue = new Queue(QUEUE.AI_SUMMARY, { connection: producerConn });

  await scheduleRepeatableJob(queueHealthQueue, JOB.QUEUE_HEALTH_CHECK, JOB.QUEUE_HEALTH_ID, FIVE_MINUTES_MS);

  const queueHealthWorker = new Worker(QUEUE.QUEUE_HEALTH, async () => {
    await checkGatewayQueueHealth([
      { label: 'inbound', queueName: QUEUE.INBOUND, queue: queueHealthInboundQueue },
      { label: 'aiSummary', queueName: QUEUE.AI_SUMMARY, queue: queueHealthSummaryQueue },
    ], {
      counterClient: producerConn,
    });
  }, { connection: workerConn, ...workerOptions });
  registerWorkerFailure(queueHealthWorker, 'QueueHealth', 'queue-health');

  return {
    workers: [
      tokenHealthWorker,
      customerMemoryWorker,
      customerMemoryRefreshWorker,
      archivalWorker,
      purgeWorker,
      digestWorker,
      voiceSynthesisWorker,
      orderRiskWorker,
      queueHealthWorker,
    ],
    queues: [
      tokenHealthQueue,
      customerMemoryQueue,
      customerMemoryRefreshQueue,
      archivalQueue,
      purgeQueue,
      digestQueue,
      voiceSynthesisQueue,
      orderRiskQueue,
      queueHealthQueue,
      queueHealthInboundQueue,
      queueHealthSummaryQueue,
    ],
  };
}
