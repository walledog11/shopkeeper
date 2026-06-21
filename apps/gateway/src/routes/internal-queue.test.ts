import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerInternalQueueRoutes } from './internal-queue.js';

const removeFailedQueueJob = vi.fn();
const clearQueueDiagnosticsCache = vi.fn();
const queueAdd = vi.fn();

vi.mock('../queue-maintenance.js', () => ({
  removeFailedQueueJob: (...args: unknown[]) => removeFailedQueueJob(...args),
}));

vi.mock('../health.js', () => ({
  clearQueueDiagnosticsCache: () => clearQueueDiagnosticsCache(),
}));

vi.mock('../clients/gateway-queues.js', () => ({
  getGatewayBullMqQueue: () => ({ add: (...args: unknown[]) => queueAdd(...args) }),
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
    expect(queueAdd).toHaveBeenCalledWith('send-email', expect.objectContaining(validBody));
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
});

describe('POST /internal/queue/outbound-imessage', () => {
  beforeEach(() => {
    queueAdd.mockReset();
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
      .post('/internal/queue/outbound-imessage')
      .send(validBody);

    expect(response.status).toBe(401);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('enqueues the send and returns 202 when authorized', async () => {
    queueAdd.mockResolvedValue({ id: 'job_99' });

    const response = await request(createApp())
      .post('/internal/queue/outbound-imessage')
      .set('x-internal-secret', 'test-internal-secret')
      .send(validBody);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ enqueued: true, jobId: 'job_99' });
    expect(queueAdd).toHaveBeenCalledWith('send-imessage', expect.objectContaining(validBody));
  });

  it('returns 400 when a required field is missing', async () => {
    const response = await request(createApp())
      .post('/internal/queue/outbound-imessage')
      .set('x-internal-secret', 'test-internal-secret')
      .send({ ...validBody, integrationId: '' });

    expect(response.status).toBe(400);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('returns 400 for an email-only source not allowed on iMessage', async () => {
    const response = await request(createApp())
      .post('/internal/queue/outbound-imessage')
      .set('x-internal-secret', 'test-internal-secret')
      .send({ ...validBody, source: 'agent_send_email' });

    expect(response.status).toBe(400);
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
