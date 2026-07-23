import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROCESSING_QUEUE_DEFAULTS, QUEUE } from '../constants.js';
import type { AiSummaryJobData, InboundJobData } from '../types.js';
import type { FailedJobSnapshot } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

interface MockQueueInstance {
  name: string;
  options: unknown;
  add: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface MockWorkerInstance {
  name: string;
  processor: unknown;
  options: unknown;
  on: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

const {
  mockLogger,
  queueInstances,
  workerInstances,
} = vi.hoisted(() => ({
  mockLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  queueInstances: [] as MockQueueInstance[],
  workerInstances: [] as MockWorkerInstance[],
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function (
    this: MockQueueInstance,
    name: string,
    options: unknown,
  ) {
    this.name = name;
    this.options = options;
    this.add = vi.fn().mockResolvedValue({ id: `${name}-job` });
    this.close = vi.fn().mockResolvedValue(undefined);
    queueInstances.push(this);
  }),
  Worker: vi.fn().mockImplementation(function (
    this: MockWorkerInstance,
    name: string,
    processor: unknown,
    options: unknown,
  ) {
    this.name = name;
    this.processor = processor;
    this.options = options;
    this.on = vi.fn();
    this.close = vi.fn().mockResolvedValue(undefined);
    workerInstances.push(this);
  }),
}));

vi.mock('@shopkeeper/db', () => ({
  db: {
    organization: {
      findUnique: vi.fn().mockResolvedValue({ settings: {} }),
    },
  },
  reserveDailyRefundSpend: vi.fn().mockResolvedValue({
    kind: 'reserved',
    reservation: { id: 'reservation_1', status: 'reserved' },
  }),
  commitDailyRefundSpendReservation: vi.fn().mockResolvedValue(undefined),
  releaseDailyRefundSpendReservation: vi.fn().mockResolvedValue(undefined),
  markDailyRefundSpendReservationUnknown: vi.fn().mockResolvedValue(undefined),
  recordReturnWatch: vi.fn().mockResolvedValue(undefined),
  recordFollowUpWatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@shopkeeper/agent/settings', () => ({
  resolveAgentSettings: vi.fn().mockReturnValue({ autoPlanOnOpen: true }),
  isWithinBusinessHours: vi.fn().mockReturnValue(true),
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../message-handlers/channels.js', () => ({
  handleEmailJob: vi.fn(),
  handleIgDmJob: vi.fn(),
  handleShopifyJob: vi.fn(),
}));

vi.mock('../message-handlers/intelligence.js', () => ({
  generateThreadIntelligence: vi.fn().mockResolvedValue({ filterStatus: 'genuine', aiSummary: 'Summary' }),
}));

vi.mock('../message-handlers/planning.js', () => ({
  precomputeThreadPlan: vi.fn().mockResolvedValue(null),
  sendAutoAck: vi.fn(),
}));

vi.mock('../message-handlers/planning-notifications.js', () => ({
  sendOperatorAutoExecutionNotification: vi.fn(),
  sendOperatorPlanNotification: vi.fn(),
}));

import { createCoreWorkerResources } from './core.js';
import {
  createGatewayWorkerShutdown,
  mergeGatewayWorkerResources,
} from './resources.js';

beforeEach(() => {
  queueInstances.length = 0;
  workerInstances.length = 0;
  mockLogger.error.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
});

describe('createCoreWorkerResources', () => {
  it('registers the core queue and workers with the existing options', () => {
    const producerConn = { name: 'producer-conn' };
    const workerConn = { name: 'worker-conn' };
    const workerOptions: SharedGatewayWorkerOptions = {
      connection: workerConn,
      drainDelay: 7,
      stalledInterval: 8,
    };

    const resources = createCoreWorkerResources(producerConn, workerOptions);

    expect(resources.aiSummaryQueue).toBe(queueInstances[0]);
    expect(resources.inboundQueue).toBe(queueInstances[1]);
    expect(resources.messageWorker).toBe(workerInstances[0]);
    expect(resources.aiSummaryWorker).toBe(workerInstances[1]);
    expect(resources.workers).toEqual(workerInstances);
    expect(resources.queues).toEqual(queueInstances);
    expect(resources.heartbeats).toHaveLength(0);
    expect(resources.shutdownResources).toHaveLength(0);

    expect(queueInstances.map((queue) => queue.name)).toEqual([
      QUEUE.AI_SUMMARY,
      QUEUE.INBOUND,
    ]);
    expect(readOptions(queueInstances[0])).toMatchObject({
      connection: producerConn,
      defaultJobOptions: PROCESSING_QUEUE_DEFAULTS,
    });

    expect(workerInstances.map((worker) => worker.name)).toEqual([
      QUEUE.INBOUND,
      QUEUE.AI_SUMMARY,
      QUEUE.ORDER_REVIEW,
      QUEUE.OUTBOUND_EMAIL,
      QUEUE.GMAIL_SYNC,
      QUEUE.OPERATOR_EVENT,
    ]);
    expect(workerInstances.every((worker) => {
      const options = readOptions(worker);
      return options.connection === workerConn
        && options.drainDelay === 7
        && options.stalledInterval === 8;
    })).toBe(true);
    expect(workerInstances.every((worker) => worker.on.mock.calls[0]?.[0] === 'failed')).toBe(true);
  });

  it('keeps core worker failure telemetry unchanged', () => {
    createCoreWorkerResources({ name: 'producer-conn' }, {
      connection: { name: 'worker-conn' },
      drainDelay: 7,
      stalledInterval: 8,
    });

    const inboundError = new Error('inbound boom');
    readFailedHandler<InboundJobData>(workerInstances[0])({
      id: 'inbound-job',
      attemptsMade: 2,
      data: {
        platform: 'email',
        organizationId: 'org_1',
        traceId: 'trace_1',
      },
    }, inboundError);

    expect(mockLogger.error).toHaveBeenCalledWith(
      {
        err: 'inbound boom',
        jobId: 'inbound-job',
        queue: 'inbound',
        platform: 'email',
        organizationId: 'org_1',
        traceId: 'trace_1',
        attemptsMade: 2,
      },
      '[Worker] Job failed permanently',
    );

    const summaryError = new Error('summary boom');
    readFailedHandler<AiSummaryJobData>(workerInstances[1])({
      id: 'summary-job',
      attemptsMade: 3,
      data: {
      threadId: 'thread_1',
      organizationId: 'org_1',
      sourceMessageId: 'message_1',
        customerName: 'Customer',
        channelType: 'email',
        traceId: 'trace_2',
      },
    }, summaryError);

    expect(mockLogger.error).toHaveBeenCalledWith(
      {
        err: 'summary boom',
        jobId: 'summary-job',
        threadId: 'thread_1',
        queue: 'aiSummary',
        organizationId: 'org_1',
        traceId: 'trace_2',
        attemptsMade: 3,
      },
      '[AISummary] Job failed',
    );
  });
});

describe('core worker shutdown resources', () => {
  it('stops heartbeat, closes core workers and queues, then closes shutdown resources', async () => {
    const coreResources = createCoreWorkerResources({ name: 'producer-conn' }, {
      connection: { name: 'worker-conn' },
      drainDelay: 7,
      stalledInterval: 8,
    });
    const stopHeartbeat = vi.fn();
    const closeRedis = vi.fn().mockResolvedValue(undefined);
    const exitProcess = vi.fn() as unknown as (code?: number) => never;
    const resources = mergeGatewayWorkerResources(coreResources, {
      workers: [],
      queues: [],
      heartbeats: [{ stop: stopHeartbeat }],
      shutdownResources: [{ label: 'redis', close: closeRedis }],
    });

    await createGatewayWorkerShutdown(resources, { exitProcess })(false);

    expect(stopHeartbeat).toHaveBeenCalledTimes(1);
    expect(workerInstances.every((worker) => worker.close.mock.calls.length === 1)).toBe(true);
    expect(queueInstances.every((queue) => queue.close.mock.calls.length === 1)).toBe(true);
    expect(closeRedis).toHaveBeenCalledTimes(1);
    expect(exitProcess).not.toHaveBeenCalled();
  });
});

type FailedHandler<DataType> = (
  job: FailedJobSnapshot<DataType> | undefined,
  err: Error,
) => void;

function readFailedHandler<DataType>(worker: MockWorkerInstance | undefined): FailedHandler<DataType> {
  const handler = worker?.on.mock.calls[0]?.[1];
  if (typeof handler !== 'function') {
    throw new Error('Missing failed handler');
  }
  return handler as FailedHandler<DataType>;
}

function readOptions(resource: { options: unknown } | undefined): Record<string, unknown> {
  if (!resource?.options || typeof resource.options !== 'object' || Array.isArray(resource.options)) {
    throw new Error('Expected object options');
  }
  return resource.options as Record<string, unknown>;
}
