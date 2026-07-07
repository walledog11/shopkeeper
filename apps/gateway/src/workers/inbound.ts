import { Worker, type Queue } from 'bullmq';
import { CHANNEL, QUEUE } from '../constants.js';
import logger from '../logger.js';
import { handleEmailJob, handleIgDmJob, handleShopifyJob, handleTikTokShopJob } from '../message-handlers/channels.js';
import type { AiSummaryJobData, InboundJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

export interface InboundWorkerRegistrationOptions {
  aiSummaryQueue: Queue<AiSummaryJobData>;
  workerOptions: SharedGatewayWorkerOptions;
}

export function createInboundWorker(options: InboundWorkerRegistrationOptions): Worker<InboundJobData> {
  const worker = new Worker<InboundJobData>(QUEUE.INBOUND, async (job) => {
    const { organizationId, traceId } = job.data;
    logger.info({ jobId: job.id, platform: job.data.platform, traceId }, '[Worker] Picked up job');

    if (!organizationId) {
      logger.error({ jobId: job.id, traceId }, '[Worker] Job is missing organizationId — dropping');
      return;
    }

    if (job.data.platform === CHANNEL.IG_DM) {
      await handleIgDmJob(job, options.aiSummaryQueue);
    } else if (job.data.platform === CHANNEL.EMAIL) {
      await handleEmailJob(job, options.aiSummaryQueue);
    } else if (job.data.platform === CHANNEL.SHOPIFY) {
      await handleShopifyJob(job, options.aiSummaryQueue);
    } else if (job.data.platform === CHANNEL.TIKTOK) {
      await handleTikTokShopJob(job, options.aiSummaryQueue);
    } else {
      logger.error(
        { jobId: job.id, platform: job.data.platform, traceId },
        '[Worker] Unknown inbound platform',
      );
      throw new Error(`Unknown inbound platform: ${String(job.data.platform)}`);
    }
  }, options.workerOptions);

  registerJobFailureLogging(worker, {
    logMessage: '[Worker] Job failed permanently',
    logFields: (job) => ({ jobId: job?.id }),
    failureExtra: (job) => ({
      jobId: job?.id,
      queue: 'inbound',
      platform: job?.data?.platform,
      organizationId: job?.data?.organizationId,
      traceId: job?.data?.traceId,
      attemptsMade: job?.attemptsMade,
    }),
  });

  return worker;
}
