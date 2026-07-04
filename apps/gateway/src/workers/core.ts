import { Queue, type ConnectionOptions, type Worker } from 'bullmq';
import { PROCESSING_QUEUE_DEFAULTS, QUEUE } from '../constants.js';
import type { AiSummaryJobData, GmailSyncJobData, InboundJobData } from '../types.js';
import { createAiSummaryWorker } from './ai-summary.js';
import {
  createGmailSyncWorker,
  type GmailSyncWorkerRegistrationOptions,
} from './gmail-sync.js';
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
  gmailSyncWorker: Worker<GmailSyncJobData>;
  inboundQueue: Queue<InboundJobData>;
}

export function createCoreWorkerResources(
  producerConn: ConnectionOptions,
  workerOptions: SharedGatewayWorkerOptions,
): CoreWorkerResources {
  const aiSummaryQueue = new Queue<AiSummaryJobData>(QUEUE.AI_SUMMARY, {
    connection: producerConn,
    defaultJobOptions: PROCESSING_QUEUE_DEFAULTS,
  });
  const inboundQueue = new Queue<InboundJobData>(QUEUE.INBOUND, {
    connection: producerConn,
    defaultJobOptions: PROCESSING_QUEUE_DEFAULTS,
  });
  const messageWorker = createInboundWorker({ aiSummaryQueue, workerOptions });
  const aiSummaryWorker = createAiSummaryWorker(workerOptions);
  const orderReviewWorker = createOrderReviewWorker({ workerOptions });
  const outboundEmailWorker = createOutboundEmailWorker({ workerOptions });
  const gmailSyncWorker = createGmailSyncWorker({
    inboundQueue,
    redis: producerConn as GmailSyncWorkerRegistrationOptions['redis'],
    workerOptions,
  });

  return {
    messageWorker,
    aiSummaryWorker,
    aiSummaryQueue,
    orderReviewWorker,
    outboundEmailWorker,
    gmailSyncWorker,
    inboundQueue,
    workers: [
      messageWorker,
      aiSummaryWorker,
      orderReviewWorker,
      outboundEmailWorker,
      gmailSyncWorker,
    ],
    queues: [aiSummaryQueue, inboundQueue],
    heartbeats: [],
    shutdownResources: [],
  };
}
