import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JOB, QUEUE } from '../constants.js';

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
  mockCaptureException,
  mockLogger,
  queueInstances,
  workerInstances,
} = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockLogger: {
    error: vi.fn(),
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

vi.mock('@sentry/node', () => ({
  captureException: mockCaptureException,
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

import {
  closeMaintenanceQueues,
  closeMaintenanceWorkers,
  createMaintenanceWorkers,
  maintenanceJobRegistrations,
} from './workers.js';
import type { MaintenanceResources, ProducerConnection, SharedWorkerOptions } from './workers.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

beforeEach(() => {
  queueInstances.length = 0;
  workerInstances.length = 0;
  mockCaptureException.mockClear();
  mockLogger.error.mockClear();
});

describe('createMaintenanceWorkers', () => {
  it('builds maintenance resources from the composition registry', async () => {
    const producerConn = createProducerConnection();
    const workerConn = { name: 'worker-conn' };
    const workerOptions: SharedWorkerOptions = { drainDelay: 7, stalledInterval: 8 };

    const resources = await createMaintenanceWorkers(workerConn, producerConn, workerOptions);

    expect(maintenanceJobRegistrations).toHaveLength(6);
    expect(resources.workers).toHaveLength(7);
    expect(resources.queues).toHaveLength(10);
    expect(queueInstances.map((queue) => queue.name)).toEqual([
      QUEUE.TOKEN_HEALTH,
      QUEUE.ARCHIVAL,
      QUEUE.PURGE,
      QUEUE.DIGEST,
      QUEUE.VOICE_SYNTHESIS,
      QUEUE.ORDER_RISK,
      QUEUE.ORDER_REVIEW,
      QUEUE.QUEUE_HEALTH,
      QUEUE.INBOUND,
      QUEUE.AI_SUMMARY,
    ]);
    expect(workerInstances.map((worker) => worker.name)).toEqual([
      QUEUE.TOKEN_HEALTH,
      QUEUE.ARCHIVAL,
      QUEUE.PURGE,
      QUEUE.DIGEST,
      QUEUE.VOICE_SYNTHESIS,
      QUEUE.ORDER_RISK,
      QUEUE.QUEUE_HEALTH,
    ]);

    expect(workerInstances.every((worker) => {
      const options = readOptions(worker);
      return options.connection === workerConn
        && options.drainDelay === workerOptions.drainDelay
        && options.stalledInterval === workerOptions.stalledInterval;
    })).toBe(true);
  });

  it('preserves repeatable schedules and job ids', async () => {
    await createMaintenanceWorkers(
      { name: 'worker-conn' },
      createProducerConnection(),
      { drainDelay: 7, stalledInterval: 8 },
    );

    expect(readRepeatJob(QUEUE.TOKEN_HEALTH)).toEqual({
      name: JOB.TOKEN_HEALTH_CHECK,
      jobId: JOB.TOKEN_HEALTH_ID,
      every: ONE_DAY_MS,
    });
    expect(readRepeatJob(QUEUE.ARCHIVAL)).toEqual({
      name: JOB.ARCHIVE_THREADS,
      jobId: JOB.ARCHIVE_THREADS_ID,
      every: ONE_DAY_MS,
    });
    expect(readRepeatJob(QUEUE.PURGE)).toEqual({
      name: JOB.PURGE_DELETED,
      jobId: JOB.PURGE_DELETED_ID,
      every: ONE_DAY_MS,
    });
    expect(readRepeatJob(QUEUE.DIGEST)).toEqual({
      name: JOB.DIGEST,
      jobId: JOB.DIGEST_ID,
      every: ONE_HOUR_MS,
    });
    expect(readRepeatJob(QUEUE.VOICE_SYNTHESIS)).toEqual({
      name: JOB.VOICE_SYNTHESIS,
      jobId: JOB.VOICE_SYNTHESIS_ID,
      every: ONE_DAY_MS,
    });
    expect(readRepeatJob(QUEUE.ORDER_RISK)).toEqual({
      name: JOB.ORDER_RISK_SCAN,
      jobId: JOB.ORDER_RISK_ID,
      every: ONE_HOUR_MS,
    });
    expect(readRepeatJob(QUEUE.QUEUE_HEALTH)).toEqual({
      name: JOB.QUEUE_HEALTH_CHECK,
      jobId: JOB.QUEUE_HEALTH_ID,
      every: FIVE_MINUTES_MS,
    });
    expect(findQueue(QUEUE.INBOUND).add).not.toHaveBeenCalled();
    expect(findQueue(QUEUE.AI_SUMMARY).add).not.toHaveBeenCalled();
  });

  it('attaches the shared failure logger to every registered worker', async () => {
    await createMaintenanceWorkers(
      { name: 'worker-conn' },
      createProducerConnection(),
      { drainDelay: 7, stalledInterval: 8 },
    );

    expect(workerInstances.every((worker) => worker.on.mock.calls[0]?.[0] === 'failed')).toBe(true);

    const handler = workerInstances[0]?.on.mock.calls[0]?.[1] as FailedHandler;
    const err = new Error('boom');
    handler({ id: 'job-1', attemptsMade: 2 }, err);

    expect(mockLogger.error).toHaveBeenCalledWith({ err: 'boom', jobId: 'job-1' }, '[TokenHealth] Job failed');
    expect(mockCaptureException).toHaveBeenCalledWith(err, {
      extra: {
        jobId: 'job-1',
        queue: 'token-health',
        attemptsMade: 2,
      },
    });
  });
});

describe('maintenance resource shutdown', () => {
  it('closes every worker and queue returned by the registry', async () => {
    const resources = await createMaintenanceWorkers(
      { name: 'worker-conn' },
      createProducerConnection(),
      { drainDelay: 7, stalledInterval: 8 },
    );

    await closeMaintenanceWorkers(resources);
    await closeMaintenanceQueues(resources);

    expect(workerInstances.every((worker) => worker.close.mock.calls.length === 1)).toBe(true);
    expect(queueInstances.every((queue) => queue.close.mock.calls.length === 1)).toBe(true);
  });

  it('supports empty maintenance resources when maintenance is disabled', async () => {
    const resources: MaintenanceResources = { workers: [], queues: [] };

    await expect(closeMaintenanceWorkers(resources)).resolves.toBeUndefined();
    await expect(closeMaintenanceQueues(resources)).resolves.toBeUndefined();
  });
});

type FailedHandler = (
  job: { id?: string; attemptsMade?: number } | undefined,
  err: Error,
) => void;

function createProducerConnection(): ProducerConnection {
  return {
    name: 'producer-conn',
    incr: vi.fn(),
    expire: vi.fn(),
  } as ProducerConnection;
}

function findQueue(queueName: string): MockQueueInstance {
  const queue = queueInstances.find((candidate) => candidate.name === queueName);
  if (!queue) throw new Error(`Missing queue ${queueName}`);
  return queue;
}

function readOptions(resource: { options: unknown }): Record<string, unknown> {
  if (!resource.options || typeof resource.options !== 'object' || Array.isArray(resource.options)) {
    throw new Error('Expected object options');
  }
  return resource.options as Record<string, unknown>;
}

function readRepeatJob(queueName: string): { name: unknown; jobId: unknown; every: unknown } {
  const addCall = findQueue(queueName).add.mock.calls[0];
  if (!addCall) throw new Error(`Missing repeatable job for ${queueName}`);

  const options = addCall[2];
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error(`Missing repeatable job options for ${queueName}`);
  }
  const repeat = (options as { repeat?: { every?: unknown }; jobId?: unknown }).repeat;
  return {
    name: addCall[0],
    jobId: (options as { jobId?: unknown }).jobId,
    every: repeat?.every,
  };
}
