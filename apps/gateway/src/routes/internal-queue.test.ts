import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerInternalQueueRoutes } from './internal-queue.js';

const removeFailedQueueJob = vi.fn();
const clearQueueDiagnosticsCache = vi.fn();

vi.mock('../queue-maintenance.js', () => ({
  removeFailedQueueJob: (...args: unknown[]) => removeFailedQueueJob(...args),
}));

vi.mock('../health.js', () => ({
  clearQueueDiagnosticsCache: () => clearQueueDiagnosticsCache(),
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
