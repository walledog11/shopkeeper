import { Worker, Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { pathToFileURL } from 'node:url';
import { db } from '@clerk/db';
import * as Sentry from '@sentry/node';
import logger from './logger.js';
import { QUEUE } from './constants.js';
import { CHANNEL } from './constants.js';
import type { InboundJobData, AiSummaryJobData } from './types.js';
import { validateGatewayEnv } from './env.js';
import { writeWorkerHeartbeat } from './health.js';
import { handleIgDmJob, handleEmailJob, handleShopifyJob, generateThreadIntelligence, sendWhatsAppPlanNotification, isWithinBusinessHours, sendAutoAck, resolveBusinessHoursSettings } from './message-handlers.js';
import { createMaintenanceWorkers } from './maintenance-workers.js';
import { loadGatewayEnv } from './load-env.js';
import { getGatewayWorkerRedisConfig } from './runtime-config.js';

export async function startWorkerRuntime() {
  validateGatewayEnv();

  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'production' });
  }

  const redisUrl = new URL(process.env.REDIS_URL!);
  redisUrl.pathname = '/0';
  const redisUrlStr = redisUrl.toString();
  const workerRedisConfig = getGatewayWorkerRedisConfig();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  // Queues (producers) use non-blocking commands — maxRetriesPerRequest left at default (20) so
  // enqueue calls fail fast rather than hanging indefinitely if Redis is unavailable.
  const sharedProducerConn = new IORedis(redisUrlStr) as any;
  // Workers use maxRetriesPerRequest: null so they wait for Redis to recover instead of erroring.
  // setMaxListeners raised to accommodate one listener per Worker (5) plus our own error handler.
  const sharedWorkerConn = new IORedis(redisUrlStr, { maxRetriesPerRequest: null }) as any;
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
    Sentry.captureException(err, { extra: { jobId: job?.id, platform: job?.data?.platform } });
  });

  const aiSummaryWorker = new Worker<AiSummaryJobData>(QUEUE.AI_SUMMARY, async (job) => {
    const { threadId, organizationId, customerName, channelType, traceId } = job.data;
    logger.info({ threadId, organizationId, traceId }, '[AISummary] Processing job');
    const updatedThread = await generateThreadIntelligence(threadId);

    // Check business hours before deciding whether to send a plan notification or an auto-ack
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const bizSettings = resolveBusinessHoursSettings((org?.settings ?? {}) as Record<string, unknown>);

    if (!isWithinBusinessHours(bizSettings)) {
      logger.info({ threadId, organizationId }, '[AISummary] Outside business hours — sending auto-ack');
      await sendAutoAck(organizationId, threadId);
      return;
    }

    await sendWhatsAppPlanNotification(organizationId, threadId, customerName, channelType, updatedThread?.aiSummary ?? null);
  }, workerOptions);

  aiSummaryWorker.on('failed', (job, err) => {
    logger.error({ err: err.message, jobId: job?.id, threadId: job?.data?.threadId }, '[AISummary] Job failed');
    Sentry.captureException(err, { extra: { jobId: job?.id, threadId: job?.data?.threadId } });
  });

  const { workers: maintenanceWorkers, queues: maintenanceQueues } = workerRedisConfig.maintenanceWorkersEnabled
    ? await createMaintenanceWorkers(sharedWorkerConn, sharedProducerConn, workerOptions)
    : { workers: [], queues: [] };

  const shutdown = async (exitProcess = false) => {
    logger.info('[Worker] Shutting down gracefully');
    clearInterval(heartbeatTimer);
    await Promise.all([messageWorker.close(), aiSummaryWorker.close(), ...maintenanceWorkers.map(w => w.close())]);
    await Promise.all([aiSummaryQueue.close(), ...maintenanceQueues.map(q => q.close())]);
    await Promise.all([
      sharedProducerConn.quit().catch(() => sharedProducerConn.disconnect()),
      sharedWorkerConn.quit().catch(() => sharedWorkerConn.disconnect()),
    ]);

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

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  try {
    loadGatewayEnv();
    await startWorkerRuntime();
  } catch (error) {
    console.error(error instanceof Error ? error.message : '[Worker] Failed startup env validation');
    process.exit(1);
  }
}
