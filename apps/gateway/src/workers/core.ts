import { Queue, type ConnectionOptions, type Worker } from 'bullmq';
import { PROCESSING_QUEUE_DEFAULTS, QUEUE } from '../constants.js';
import type { AiSummaryJobData, InboundJobData } from '../types.js';
import { createAiSummaryWorker } from './ai-summary.js';
import { createInboundWorker } from './inbound.js';
import { createOrderReviewWorker } from './order-review.js';
import { createOutboundEmailWorker } from './outbound-email.js';
import type { GatewayWorkerResources, SharedGatewayWorkerOptions } from './resources.js';
import type { OrderReviewJobData, OutboundEmailJobData } from '../types.js';

export interface CoreWorkerResources extends GatewayWorkerResources {
  messageWorker: Worker<InboundJobData>;
  aiSummaryWorker: Worker<AiSummaryJobData>;
  aiSummaryQueue: Queue<AiSummaryJobData>;
  orderReviewWorker: Worker<OrderReviewJobData>;
  outboundEmailWorker: Worker<OutboundEmailJobData>;
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
  const orderReviewWorker = createOrderReviewWorker({ workerOptions });
  const outboundEmailWorker = createOutboundEmailWorker({ workerOptions });

  return {
    messageWorker,
    aiSummaryWorker,
    aiSummaryQueue,
    orderReviewWorker,
    outboundEmailWorker,
    workers: [messageWorker, aiSummaryWorker, orderReviewWorker, outboundEmailWorker],
    queues: [aiSummaryQueue],
    heartbeats: [],
    shutdownResources: [],
  };
}
