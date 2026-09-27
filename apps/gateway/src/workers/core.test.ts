import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

vi.mock('@shopkeeper/agent/settings', () => ({
  resolveAgentSettings: vi.fn().mockReturnValue({ autoPlanOnOpen: true }),
  isWithinBusinessHours: vi.fn().mockReturnValue(true),
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../message-handlers/inbound/channels.js', () => ({
  handleEmailJob: vi.fn(),
  handleIgDmJob: vi.fn(),
  handleShopifyJob: vi.fn(),
}));

vi.mock('../message-handlers/inbound/intelligence.js', () => ({
  generateThreadIntelligence: vi.fn().mockResolvedValue({ filterStatus: 'genuine', aiSummary: 'Summary' }),
}));

vi.mock('../message-handlers/support-plan/planning.js', () => ({
  precomputeThreadPlan: vi.fn().mockResolvedValue(null),
  sendAutoAck: vi.fn(),
}));

vi.mock('../message-handlers/support-plan/planning-notifications.js', () => ({
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

  it('coalesces repeated signal shutdowns while active jobs drain', async () => {
    const coreResources = createCoreWorkerResources({ name: 'producer-conn' }, {
      connection: { name: 'worker-conn' },
      drainDelay: 7,
      stalledInterval: 8,
    });
    let finishActiveJob!: () => void;
    const activeJob = new Promise<void>((resolve) => {
      finishActiveJob = resolve;
    });
    workerInstances[0]?.close.mockImplementationOnce(() => activeJob);
    const stopHeartbeat = vi.fn();
    const exitProcess = vi.fn();
    const resources = mergeGatewayWorkerResources(coreResources, {
      workers: [],
      queues: [],
      heartbeats: [{ stop: stopHeartbeat }],
      shutdownResources: [],
    });
    const shutdown = createGatewayWorkerShutdown(resources, { exitProcess });

    const firstSignal = shutdown(true);
    const secondSignal = shutdown(true);
    await Promise.resolve();

    expect(secondSignal).toBe(firstSignal);
    expect(stopHeartbeat).toHaveBeenCalledOnce();
    expect(workerInstances.every((worker) => worker.close.mock.calls.length === 1)).toBe(true);
    expect(queueInstances.every((queue) => queue.close.mock.calls.length === 0)).toBe(true);

    finishActiveJob();
    await firstSignal;

    expect(queueInstances.every((queue) => queue.close.mock.calls.length === 1)).toBe(true);
    expect(exitProcess).toHaveBeenCalledOnce();
    expect(exitProcess).toHaveBeenCalledWith(0);
  });

  it('attempts every cleanup resource and exits nonzero when one rejects', async () => {
    const coreResources = createCoreWorkerResources({ name: 'producer-conn' }, {
      connection: { name: 'worker-conn' },
      drainDelay: 7,
      stalledInterval: 8,
    });
    const cleanupError = new Error('redis close failed');
    const rejectedCleanup = vi.fn().mockRejectedValue(cleanupError);
    const successfulCleanup = vi.fn().mockResolvedValue(undefined);
    const exitProcess = vi.fn();
    const resources = mergeGatewayWorkerResources(coreResources, {
      workers: [],
      queues: [],
      heartbeats: [],
      shutdownResources: [
        { label: 'redis', close: rejectedCleanup },
        { label: 'database', close: successfulCleanup },
      ],
    });

    await createGatewayWorkerShutdown(resources, { exitProcess })(true);

    expect(rejectedCleanup).toHaveBeenCalledOnce();
    expect(successfulCleanup).toHaveBeenCalledOnce();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: cleanupError, resource: 'redis' },
      '[Worker] Shutdown resource failed',
    );
    expect(exitProcess).toHaveBeenCalledOnce();
    expect(exitProcess).toHaveBeenCalledWith(1);
  });
});
