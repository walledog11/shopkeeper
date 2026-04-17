import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env'), override: true });

import { Worker, Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { db } from '@clerk/db';
import * as Sentry from '@sentry/node';
import logger from './logger.js';
import { QUEUE } from './constants.js';
import { CHANNEL } from './constants.js';
import type { InboundJobData, AiSummaryJobData } from './types.js';
import { handleIgDmJob, handleEmailJob, handleShopifyJob, generateThreadIntelligence, sendWhatsAppPlanNotification, isWithinBusinessHours, sendAutoAck, resolveBusinessHoursSettings } from './message-handlers.js';
import { createMaintenanceWorkers } from './maintenance-workers.js';

const REQUIRED_ENV = ['INTERNAL_API_SECRET', 'DASHBOARD_INTERNAL_URL', 'ANTHROPIC_API_KEY', 'REDIS_URL', 'DATABASE_URL'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[Worker] Missing required env var: ${key} — aborting startup`);
    process.exit(1);
  }
}

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'production' });
}

const redisUrl = new URL(process.env.REDIS_URL!);
redisUrl.pathname = '/0';
const redisUrlStr = redisUrl.toString();

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

const aiSummaryQueue = new Queue(QUEUE.AI_SUMMARY, {
  connection: sharedProducerConn,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
});

// ─── Inbound Message Worker ────────────────────────────────────────────────────

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
}, { connection: sharedWorkerConn });

messageWorker.on('failed', (job, err) => {
  logger.error({ err: err.message, jobId: job?.id }, '[Worker] Job failed permanently');
  Sentry.captureException(err, { extra: { jobId: job?.id, platform: job?.data?.platform } });
});

// ─── AI Summary Worker ─────────────────────────────────────────────────────────

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
}, { connection: sharedWorkerConn });

aiSummaryWorker.on('failed', (job, err) => {
  logger.error({ err: err.message, jobId: job?.id, threadId: job?.data?.threadId }, '[AISummary] Job failed');
  Sentry.captureException(err, { extra: { jobId: job?.id, threadId: job?.data?.threadId } });
});

// ─── Maintenance Workers ───────────────────────────────────────────────────────

const { workers: maintenanceWorkers, queues: maintenanceQueues } =
  await createMaintenanceWorkers(sharedWorkerConn, sharedProducerConn);

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────

async function shutdown() {
  logger.info('[Worker] Shutting down gracefully');
  await Promise.all([messageWorker.close(), aiSummaryWorker.close(), ...maintenanceWorkers.map(w => w.close())]);
  await Promise.all([aiSummaryQueue.close(), ...maintenanceQueues.map(q => q.close())]);
  await Promise.all([
    sharedProducerConn.quit().catch(() => sharedProducerConn.disconnect()),
    sharedWorkerConn.quit().catch(() => sharedWorkerConn.disconnect()),
  ]);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

logger.info('[Worker] Engine started. Listening for incoming messages...');
