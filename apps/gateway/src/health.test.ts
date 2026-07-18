import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Application } from 'express';
import express from 'express';
import request from 'supertest';

const queryRaw = vi.fn();
const getJobCounts = vi.fn();
const getJobs = vi.fn();
const imessageConfigured = vi.fn();

vi.mock('@shopkeeper/db', () => ({
  db: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

vi.mock('./clients/gateway-queues.js', () => ({
  getGatewayBullMqQueue: () => ({
    getJobCounts: (...args: unknown[]) => getJobCounts(...args),
    getJobs: (...args: unknown[]) => getJobs(...args),
  }),
}));

vi.mock('./config/runtime-config.js', () => ({
  getGatewayWorkerRedisConfig: () => ({
    heartbeatStaleMs: 60_000,
    queueDiagnosticsCacheMs: 0,
  }),
}));

vi.mock('./clients/spectrum.js', () => ({
  isImessageConfigured: () => imessageConfigured(),
}));

vi.mock('./config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config/env.js')>();
  return {
    ...actual,
    getInternalApiSecret: () => 'test-internal-secret',
  };
});

vi.mock('./logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  clearQueueDiagnosticsCache,
  readFailedQueueJobSnapshots,
  registerHealthRoutes,
} from './health.js';

interface FakeRedis {
  ping: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
}

function createHealthyRedis(): FakeRedis {
  return {
    ping: vi.fn(async () => 'PONG'),
    get: vi.fn(async () =>
      JSON.stringify({ timestamp: new Date().toISOString(), pid: 4242 }),
    ),
  };
}

function createApp(redis: FakeRedis): Application {
  const app = express();
  app.use(express.json());
  registerHealthRoutes(app, { redis } as unknown as Parameters<typeof registerHealthRoutes>[1]);
  return app;
}

describe('readFailedQueueJobSnapshots', () => {
  it('returns an empty array when there are no failed jobs', async () => {
    const queue = {
      getJobs: vi.fn(),
    };

    await expect(readFailedQueueJobSnapshots(queue, 0)).resolves.toEqual([]);
    expect(queue.getJobs).not.toHaveBeenCalled();
  });

  it('maps failed job metadata for queue diagnostics', async () => {
    const queue = {
      getJobs: vi.fn().mockResolvedValue([
        {
          id: '42',
          name: 'summarize-thread',
          failedReason: 'fetch failed',
          attemptsMade: 3,
          finishedOn: 1_700_000_000_000,
          data: {
            threadId: 'thread-1',
            organizationId: 'org-1',
            traceId: 'trace-1',
          },
        },
      ]),
    };

    await expect(readFailedQueueJobSnapshots(queue, 1)).resolves.toEqual([
      {
        id: '42',
        name: 'summarize-thread',
        failedReason: 'fetch failed',
        attemptsMade: 3,
        finishedOn: '2023-11-14T22:13:20.000Z',
        threadId: 'thread-1',
        organizationId: 'org-1',
        traceId: 'trace-1',
      },
    ]);

    expect(queue.getJobs).toHaveBeenCalledWith(['failed'], 0, 0, false);
  });
});

describe('health routes', () => {
  beforeEach(() => {
    clearQueueDiagnosticsCache();
    queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    imessageConfigured.mockReset().mockReturnValue(true);
    getJobCounts.mockReset().mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 1,
      delayed: 0,
      paused: 0,
    });
    getJobs.mockReset().mockResolvedValue([
      {
        id: 'job-1',
        name: 'process-email',
        failedReason: 'boom',
        attemptsMade: 2,
        finishedOn: 1_000,
        data: {
          threadId: 'thread_secret',
          organizationId: 'org_secret',
          traceId: 'trace_secret',
        },
      },
    ]);
  });

  describe('GET /health/deep', () => {
    it('reports coarse per-check status and 200 when healthy', async () => {
      const response = await request(createApp(createHealthyRedis())).get('/health/deep');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        checks: {
          db: { status: 'ok' },
          redis: { status: 'ok' },
          worker: { status: 'ok' },
          queues: { status: 'ok' },
          imessage: { configured: true },
        },
      });
    });

    it('never leaks queue counts, worker pid, or failed-job tenant identifiers', async () => {
      const response = await request(createApp(createHealthyRedis())).get('/health/deep');

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('failedJobs');
      expect(serialized).not.toContain('counts');
      expect(serialized).not.toContain('pid');
      expect(serialized).not.toContain('thread_secret');
      expect(serialized).not.toContain('org_secret');
      expect(response.body.checks.worker).toEqual({ status: 'ok' });
      expect(response.body.checks.queues).toEqual({ status: 'ok' });
    });

    it('degrades to 503 when a dependency check fails', async () => {
      queryRaw.mockRejectedValueOnce(new Error('db down'));

      const response = await request(createApp(createHealthyRedis())).get('/health/deep');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('degraded');
      expect(response.body.checks.db).toEqual({ status: 'error' });
    });
  });

  describe('GET /health/queues', () => {
    it('returns 401 without the internal secret', async () => {
      const response = await request(createApp(createHealthyRedis())).get('/health/queues');

      expect(response.status).toBe(401);
      expect(getJobCounts).not.toHaveBeenCalled();
    });

    it('returns full worker and queue diagnostics when authorized', async () => {
      const response = await request(createApp(createHealthyRedis()))
        .get('/health/queues')
        .set('x-internal-secret', 'test-internal-secret');

      expect(response.status).toBe(200);
      expect(response.body.worker.pid).toBe(4242);
      expect(response.body.queues.inbound.failed).toBe(1);
      expect(response.body.queues.inbound.failedJobs[0]).toMatchObject({
        threadId: 'thread_secret',
        organizationId: 'org_secret',
      });
    });
  });
});
