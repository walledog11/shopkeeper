import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const { queueAddSpy } = vi.hoisted(() => ({
  queueAddSpy: vi.fn().mockResolvedValue({ id: 'test-customer-memory-job' }),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
  }),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.add = queueAddSpy;
    this.close = vi.fn();
  }),
}));

import { registerInternalCustomerMemoryRoutes } from './internal-customer-memory.js';

function createApp() {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerInternalCustomerMemoryRoutes(router);
  app.use('/internal', router);
  return app;
}

const SECRET = 'test-internal-secret-customer-memory'; // gitleaks:allow
const app = createApp();
const originalSecret = process.env.INTERNAL_API_SECRET;
const originalPreviousSecret = process.env.INTERNAL_API_SECRET_PREV;

beforeEach(() => {
  process.env.INTERNAL_API_SECRET = SECRET;
  delete process.env.INTERNAL_API_SECRET_PREV;
  queueAddSpy.mockClear();
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = originalSecret;
  if (originalPreviousSecret === undefined) delete process.env.INTERNAL_API_SECRET_PREV;
  else process.env.INTERNAL_API_SECRET_PREV = originalPreviousSecret;
});

describe('POST /internal/customer-memory/thread-close', () => {
  it('returns 401 when x-internal-secret is missing', async () => {
    const res = await request(app)
      .post('/internal/customer-memory/thread-close')
      .send({ organizationId: 'org_1', threadId: 'thread_1' });

    expect(res.status).toBe(401);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when no thread id is provided', async () => {
    const res = await request(app)
      .post('/internal/customer-memory/thread-close')
      .set('x-internal-secret', SECRET)
      .send({ organizationId: 'org_1' });

    expect(res.status).toBe(400);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('accepts the previous internal secret during rotation', async () => {
    process.env.INTERNAL_API_SECRET_PREV = 'previous-secret';

    const res = await request(app)
      .post('/internal/customer-memory/thread-close')
      .set('x-internal-secret', 'previous-secret')
      .send({ organizationId: 'org_1', threadId: 'thread_1' });

    expect(res.status).toBe(200);
    expect(queueAddSpy).toHaveBeenCalledTimes(1);
  });

  it('enqueues one customer-memory job per unique thread id', async () => {
    const res = await request(app)
      .post('/internal/customer-memory/thread-close')
      .set('x-internal-secret', SECRET)
      .send({
        organizationId: 'org_1',
        threadIds: ['thread_1', 'thread_2', 'thread_1'],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enqueued: 2, job: 'update-customer-memory' });
    expect(queueAddSpy).toHaveBeenCalledTimes(2);
    expect(queueAddSpy).toHaveBeenNthCalledWith(
      1,
      'update-customer-memory',
      { threadId: 'thread_1', organizationId: 'org_1' },
      { jobId: 'customer-memory:thread_1' },
    );
    expect(queueAddSpy).toHaveBeenNthCalledWith(
      2,
      'update-customer-memory',
      { threadId: 'thread_2', organizationId: 'org_1' },
      { jobId: 'customer-memory:thread_2' },
    );
  });

  it('includes close-event timestamps in job data and job id when provided', async () => {
    const closedAt = '2026-05-26T12:00:00.000Z';

    const res = await request(app)
      .post('/internal/customer-memory/thread-close')
      .set('x-internal-secret', SECRET)
      .send({
        organizationId: 'org_1',
        threads: [{ threadId: 'thread_1', closedAt }],
      });

    expect(res.status).toBe(200);
    expect(queueAddSpy).toHaveBeenCalledWith(
      'update-customer-memory',
      { threadId: 'thread_1', organizationId: 'org_1', closedAt },
      { jobId: `customer-memory:thread_1:${Date.parse(closedAt)}` },
    );
  });
});
