import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '@/lib/api/errors';
import { withInternalRoute } from './internal-route';

const originalEnv = {
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
  INTERNAL_API_SECRET_PREV: process.env.INTERNAL_API_SECRET_PREV,
};

afterEach(() => {
  restoreEnv();
  vi.clearAllMocks();
});

describe('withInternalRoute', () => {
  it('rejects missing and wrong internal secrets before invoking the handler', async () => {
    process.env.INTERNAL_API_SECRET = 'current-secret';
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const POST = withInternalRoute(
      { context: 'Test internal POST', errorMessage: 'Failed' },
      handler,
    );

    for (const secret of [undefined, 'wrong-secret']) {
      const response = await POST(internalRequest(secret));
      expect(response.status).toBe(401);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts the previous internal secret during rotation', async () => {
    process.env.INTERNAL_API_SECRET = 'current-secret';
    process.env.INTERNAL_API_SECRET_PREV = 'previous-secret';
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const POST = withInternalRoute(
      { context: 'Test internal POST', errorMessage: 'Failed' },
      handler,
    );

    const response = await POST(internalRequest('previous-secret'));

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('passes mutable route state to error handlers', async () => {
    process.env.INTERNAL_API_SECRET = 'current-secret';
    const onError = vi.fn();
    const POST = withInternalRoute<{ orgId: string | null }>(
      {
        context: 'Test internal POST',
        errorMessage: 'Failed',
        createState: () => ({ orgId: null }),
        onError,
      },
      async ({ state }) => {
        state.orgId = 'org_123';
        throw new BadRequestError('Invalid request');
      },
    );

    const response = await POST(internalRequest('current-secret'));
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid request' });
    expect(onError).toHaveBeenCalledWith(expect.any(BadRequestError), { orgId: 'org_123' });
  });
});

function internalRequest(secret?: string) {
  return new Request('http://localhost/api/internal', {
    method: 'POST',
    headers: secret ? { 'x-internal-secret': secret } : {},
  });
}

function restoreEnv() {
  if (originalEnv.INTERNAL_API_SECRET === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = originalEnv.INTERNAL_API_SECRET;
  if (originalEnv.INTERNAL_API_SECRET_PREV === undefined) delete process.env.INTERNAL_API_SECRET_PREV;
  else process.env.INTERNAL_API_SECRET_PREV = originalEnv.INTERNAL_API_SECRET_PREV;
}
