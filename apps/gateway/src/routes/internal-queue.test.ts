import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerInternalQueueRoutes } from './internal-queue.js';

const removeFailedQueueJob = vi.fn();
const clearQueueDiagnosticsCache = vi.fn();
const queueAdd = vi.fn();
const queueGetJob = vi.fn();
const findMessage = vi.fn();
const findIntegration = vi.fn();

vi.mock('@shopkeeper/db', () => ({
  db: {
    message: { findFirst: (...args: unknown[]) => findMessage(...args) },
    integration: { findFirst: (...args: unknown[]) => findIntegration(...args) },
  },
}));

vi.mock('../queue-maintenance.js', () => ({
  removeFailedQueueJob: (...args: unknown[]) => removeFailedQueueJob(...args),
}));

vi.mock('../health.js', () => ({
  clearQueueDiagnosticsCache: () => clearQueueDiagnosticsCache(),
}));

vi.mock('../clients/gateway-queues.js', () => ({
  getGatewayBullMqQueue: () => ({
    add: (...args: unknown[]) => queueAdd(...args),
    getJob: (...args: unknown[]) => queueGetJob(...args),
  }),
}));

vi.mock('../config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env.js')>();
  return {
    ...actual,
    getInternalApiSecret: () => 'test-internal-secret',
  };
});

function createApp() {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerInternalQueueRoutes(router);
  app.use('/internal', router);
  return app;
}

describe('POST /internal/queue/remove-failed', () => {
  beforeEach(() => {
    removeFailedQueueJob.mockReset();
    clearQueueDiagnosticsCache.mockReset();
  });

  it('returns 401 without x-internal-secret', async () => {
    const response = await request(createApp())
      .post('/internal/queue/remove-failed')
      .send({ queue: 'ai-summary', jobId: '1' });

    expect(response.status).toBe(401);
  });

  it('removes a failed job when authorized', async () => {
    removeFailedQueueJob.mockResolvedValue(true);

    const response = await request(createApp())
      .post('/internal/queue/remove-failed')
      .set('x-internal-secret', 'test-internal-secret')
      .send({ queue: 'ai-summary', jobId: '1' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ removed: true, queue: 'ai-summary', jobId: '1' });
    expect(removeFailedQueueJob).toHaveBeenCalledWith('ai-summary', '1');
    expect(clearQueueDiagnosticsCache).toHaveBeenCalled();
  });

  it('returns 404 when the job does not exist', async () => {
    removeFailedQueueJob.mockResolvedValue(false);

    const response = await request(createApp())
      .post('/internal/queue/remove-failed')
      .set('x-internal-secret', 'test-internal-secret')
      .send({ queue: 'ai-summary', jobId: 'missing' });

    expect(response.status).toBe(404);
  });
});

describe('POST /internal/queue/outbound-email', () => {
  beforeEach(() => {
    queueAdd.mockReset();
    queueGetJob.mockReset().mockResolvedValue(null);
    findMessage.mockReset().mockResolvedValue({
      id: 'msg_1',
      threadId: 'thread_1',
      organizationId: 'org_1',
      sendStatus: 'pending',
    });
    findIntegration.mockReset().mockResolvedValue({ id: 'int_1', organizationId: 'org_1' });
  });

  const validBody = {
    organizationId: 'org_1',
    messageId: 'msg_1',
    threadId: 'thread_1',
    integrationId: 'int_1',
    source: 'agent_send_reply',
  };

  it('returns 401 without x-internal-secret', async () => {
    const response = await request(createApp())
      .post('/internal/queue/outbound-email')
      .send(validBody);

    expect(response.status).toBe(401);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('enqueues the send and returns 202 when authorized', async () => {
    queueAdd.mockResolvedValue({ id: 'job_42' });

    const response = await request(createApp())
      .post('/internal/queue/outbound-email')
      .set('x-internal-secret', 'test-internal-secret')
      .send(validBody);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ enqueued: true, jobId: 'job_42' });
    expect(queueAdd).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining(validBody),
      { jobId: 'msg_1' },
    );
  });

  it('returns 400 when a required field is missing', async () => {
    const response = await request(createApp())
      .post('/internal/queue/outbound-email')
      .set('x-internal-secret', 'test-internal-secret')
      .send({ ...validBody, integrationId: '' });

    expect(response.status).toBe(400);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid source', async () => {
    const response = await request(createApp())
      .post('/internal/queue/outbound-email')
      .set('x-internal-secret', 'test-internal-secret')
      .send({ ...validBody, source: 'bogus' });

    expect(response.status).toBe(400);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it.each([
    ['message/thread ownership', findMessage],
    ['integration ownership', findIntegration],
  ])('rejects a mismatched %s before enqueue', async (_label, missingLookup) => {
    missingLookup.mockResolvedValueOnce(null);

    const response = await request(createApp())
      .post('/internal/queue/outbound-email')
      .set('x-internal-secret', 'test-internal-secret')
      .send(validBody);

    expect(response.status).toBe(404);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('scopes every queued object to the supplied organization and thread', async () => {
    queueAdd.mockResolvedValue({ id: 'job_42' });

    await request(createApp())
      .post('/internal/queue/outbound-email')
      .set('x-internal-secret', 'test-internal-secret')
      .send(validBody);

    expect(findMessage).toHaveBeenCalledWith({
      where: {
        id: 'msg_1',
        organizationId: 'org_1',
        threadId: 'thread_1',
        thread: { organizationId: 'org_1' },
      },
      select: { id: true, threadId: true, organizationId: true, sendStatus: true },
    });
    expect(findIntegration).toHaveBeenCalledWith({
      where: { id: 'int_1', organizationId: 'org_1', platform: 'email' },
      select: { id: true, organizationId: true },
    });
  });

  it('deduplicates a message that already has an active queue job', async () => {
    const existing = {
      id: 'msg_1',
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn(),
    };
    queueGetJob.mockResolvedValueOnce(existing);

    const response = await request(createApp())
      .post('/internal/queue/outbound-email')
      .set('x-internal-secret', 'test-internal-secret')
      .send(validBody);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ enqueued: true, jobId: 'msg_1', deduplicated: true });
    expect(queueAdd).not.toHaveBeenCalled();
    expect(existing.remove).not.toHaveBeenCalled();
  });

  it.each(['failed', 'completed'])('replaces a retained %s job for an explicit failed-message retry', async (state) => {
    const existing = {
      id: 'msg_1',
      getState: vi.fn().mockResolvedValue(state),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    queueGetJob.mockResolvedValueOnce(existing);
    queueAdd.mockResolvedValue({ id: 'msg_1' });

    const response = await request(createApp())
      .post('/internal/queue/outbound-email')
      .set('x-internal-secret', 'test-internal-secret')
      .send(validBody);

    expect(response.status).toBe(202);
    expect(existing.remove).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(
      'send-email',
      expect.any(Object),
      { jobId: 'msg_1' },
    );
  });
});
