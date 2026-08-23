import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerInternalRuntimeRoutes } from './internal-runtime.js';

vi.mock('../config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env.js')>();
  return {
    ...actual,
    getInternalApiSecret: () => 'test-internal-secret',
  };
});

function createApp() {
  const app = express();
  const router = express.Router();
  registerInternalRuntimeRoutes(router);
  app.use('/internal', router);
  return app;
}

describe('GET /internal/runtime-flags', () => {
  beforeEach(() => {
    vi.stubEnv('ORDER_RISK_MONITOR_ENABLED', '1');
    vi.stubEnv('RETURN_LIFECYCLE_MONITOR_ENABLED', '0');
    vi.stubEnv('POST_RESOLUTION_FOLLOWUP_MONITOR_ENABLED', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 without x-internal-secret', async () => {
    const response = await request(createApp()).get('/internal/runtime-flags');
    expect(response.status).toBe(401);
  });

  it('returns monitor flag state when authorized', async () => {
    const response = await request(createApp())
      .get('/internal/runtime-flags')
      .set('x-internal-secret', 'test-internal-secret');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      monitors: {
        orderRisk: true,
        returnLifecycle: false,
        postResolutionFollowUp: false,
      },
    });
  });
});
