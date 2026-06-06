import { Queue, type ConnectionOptions, type Worker } from 'bullmq';
import { PROCESSING_QUEUE_DEFAULTS, QUEUE } from '../constants.js';
import type { AiSummaryJobData, InboundJobData } from '../types.js';
import { createAiSummaryWorker } from './ai-summary.js';
import { createInboundWorker } from './inbound.js';
import type { GatewayWorkerResources, SharedGatewayWorkerOptions } from './resources.js';

export interface CoreWorkerResources extends GatewayWorkerResources {
  messageWorker: Worker<InboundJobData>;
  aiSummaryWorker: Worker<AiSummaryJobData>;
  aiSummaryQueue: Queue<AiSummaryJobData>;
}

export function createCoreWorkerResources(
  producerConn: ConnectionOptions,
  workerOptions: SharedGatewayWorkerOptions,
): CoreWorkerResources {
  const aiSummaryQueue = new Queue<AiSummaryJobData>(QUEUE.AI_SUMMARY, {
    connection: producerConn,
    defaultJobOptions: PROCESSING_QUEUE_DEFAULTS,
  });
  const messageWorker = createInboundWorker({ aiSummaryQueue, workerOptions });
  const aiSummaryWorker = createAiSummaryWorker(workerOptions);

  return {
    messageWorker,
    aiSummaryWorker,
    aiSummaryQueue,
    workers: [messageWorker, aiSummaryWorker],
    queues: [aiSummaryQueue],
    heartbeats: [],
    shutdownResources: [],
  };
}
