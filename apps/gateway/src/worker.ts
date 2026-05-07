import { Worker, Queue } from 'bullmq';
import { db } from '@clerk/db';
import * as Sentry from '@sentry/node';
import logger from './logger.js';
import { QUEUE } from './constants.js';
import { CHANNEL } from './constants.js';
import type { InboundJobData, AiSummaryJobData } from './types.js';
import { validateGatewayEnv } from './config/env.js';
import { writeWorkerHeartbeat } from './health.js';
import { handleIgDmJob, handleEmailJob, handleShopifyJob } from './message-handlers/channels.js';
import { generateThreadIntelligence } from './message-handlers/intelligence.js';
import {
  sendWhatsAppPlanNotification,
  precomputeThreadPlan,
  isWithinBusinessHours,
  sendAutoAck,
  resolveBusinessHoursSettings,
} from './message-handlers/planning.js';
import { createMaintenanceWorkers } from './maintenance/workers.js';
import { getGatewayWorkerRedisConfig } from './config/runtime-config.js';
import { createGatewayRedisClient } from './clients/redis-client.js';
import { runGatewayEntry } from './bootstrap.js';

export async function startWorkerRuntime() {
  validateGatewayEnv();

  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'production' });
  }

  const workerRedisConfig = getGatewayWorkerRedisConfig();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  // Queues (producers) use non-blocking commands — maxRetriesPerRequest left at default (20) so
  // enqueue calls fail fast rather than hanging indefinitely if Redis is unavailable.
  const sharedProducerConn = createGatewayRedisClient() as any;
  // Workers use maxRetriesPerRequest: null so they wait for Redis to recover instead of erroring.
  // setMaxListeners raised to accommodate one listener per Worker (5) plus our own error handler.
  const sharedWorkerConn = createGatewayRedisClient({ maxRetriesPerRequest: null }) as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  sharedProducerConn.on('error', (err: Error) => logger.error({ err: err.message }, '[Worker] Redis producer error'));
  sharedWorkerConn.setMaxListeners(20);
  sharedWorkerConn.on('error', (err: Error) => logger.error({ err: err.message }, '[Worker] Redis worker error'));

  const workerOptions = {
    connection: sharedWorkerConn,
    drainDelay: workerRedisConfig.drainDelaySeconds,
    stalledInterval: workerRedisConfig.stalledIntervalMs,
  };

  const heartbeatTimer = setInterval(() => {
    writeWorkerHeartbeat(sharedProducerConn).catch((err) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, '[Worker] Failed to write heartbeat');
    });
  }, workerRedisConfig.heartbeatIntervalMs);
  heartbeatTimer.unref();
  await writeWorkerHeartbeat(sharedProducerConn).catch((err) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, '[Worker] Failed to write startup heartbeat');
  });

  const aiSummaryQueue = new Queue(QUEUE.AI_SUMMARY, {
    connection: sharedProducerConn,
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  });

  const messageWorker = new Worker<InboundJobData>(QUEUE.INBOUND, async (job) => {
    const { organizationId, traceId } = job.data;
    logger.info({ jobId: job.id, platform: job.data.platform, traceId }, '[Worker] Picked up job');

    if (!organizationId) {
      logger.error({ jobId: job.id, traceId }, '[Worker] Job is missing organizationId — dropping');
      return;
    }

    if (job.data.platform === CHANNEL.IG_DM) {
      await handleIgDmJob(job, aiSummaryQueue);
    } else if (job.data.platform === CHANNEL.EMAIL) {
      await handleEmailJob(job, aiSummaryQueue);
    } else if (job.data.platform === CHANNEL.SHOPIFY) {
      await handleShopifyJob(job, aiSummaryQueue);
    }
  }, workerOptions);

  messageWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id }, '[Worker] Job failed permanently');
    Sentry.captureException(err, {
      extra: {
        jobId: job?.id,
        queue: 'inbound',
        platform: job?.data?.platform,
        organizationId: job?.data?.organizationId,
        traceId: job?.data?.traceId,
        attemptsMade: job?.attemptsMade,
      },
    });
  });

  const aiSummaryWorker = new Worker<AiSummaryJobData>(QUEUE.AI_SUMMARY, async (job) => {
    const { threadId, organizationId, customerName, channelType, traceId, skipSummary } = job.data;
    logger.info({ threadId, organizationId, traceId }, '[AISummary] Processing job');
    const updatedThread = await generateThreadIntelligence(threadId, { skipSummary });

    // Only genuine threads get a plan + WhatsApp notify. Questionable show in
    // the inbox but skip both; filtered skip everything downstream.
    if (updatedThread?.filterStatus && updatedThread.filterStatus !== 'genuine') {
      logger.info(
        { threadId, organizationId, classification: updatedThread.filterStatus },
        '[AISummary] Non-genuine thread — skipping plan precompute and notification',
      );
      return;
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const rawSettings = (org?.settings ?? {}) as Record<string, unknown>;

    const planPromise = precomputeThreadPlan(organizationId, threadId, rawSettings);

    if (!isWithinBusinessHours(resolveBusinessHoursSettings(rawSettings))) {
      logger.info({ threadId, organizationId }, '[AISummary] Outside business hours — sending auto-ack');
      await Promise.all([planPromise, sendAutoAck(organizationId, threadId)]);
      return;
    }

    const planResult = await planPromise;
    if (!planResult) {
      logger.info({ threadId, organizationId }, '[AISummary] No plan precomputed — skipping WhatsApp notification');
      return;
    }

    await sendWhatsAppPlanNotification(
      organizationId,
      threadId,
      customerName,
      channelType,
      updatedThread?.aiSummary ?? null,
      planResult.plan,
      planResult.instruction,
    );
  }, workerOptions);

  aiSummaryWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id, threadId: job?.data?.threadId }, '[AISummary] Job failed');
    Sentry.captureException(err, {
      extra: {
        jobId: job?.id,
        queue: 'aiSummary',
        threadId: job?.data?.threadId,
        organizationId: job?.data?.organizationId,
        traceId: job?.data?.traceId,
        attemptsMade: job?.attemptsMade,
      },
    });
  });

  const { workers: maintenanceWorkers, queues: maintenanceQueues } = workerRedisConfig.maintenanceWorkersEnabled
    ? await createMaintenanceWorkers(sharedWorkerConn, sharedProducerConn, workerOptions)
    : { workers: [], queues: [] };

  const shutdown = async (exitProcess = false) => {
    const forceExit = setTimeout(() => {
      logger.warn('[Worker] Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 25_000);
    forceExit.unref();

    logger.info('[Worker] Shutting down gracefully');
    clearInterval(heartbeatTimer);
    await Promise.all([messageWorker.close(), aiSummaryWorker.close(), ...maintenanceWorkers.map(w => w.close())]);
    await Promise.all([aiSummaryQueue.close(), ...maintenanceQueues.map(q => q.close())]);
    await Promise.all([
      sharedProducerConn.quit().catch(() => sharedProducerConn.disconnect()),
      sharedWorkerConn.quit().catch(() => sharedWorkerConn.disconnect()),
    ]);
    await db.$disconnect().catch(() => {});

    clearTimeout(forceExit);
    if (exitProcess) process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown(true));
  process.on('SIGINT', () => void shutdown(true));

  logger.info('[Worker] Engine started. Listening for incoming messages...');

  return {
    messageWorker,
    aiSummaryWorker,
    aiSummaryQueue,
    maintenanceWorkers,
    maintenanceQueues,
    shutdown,
  };
}

await runGatewayEntry(import.meta.url, '[Worker] Failed startup env validation', startWorkerRuntime);
