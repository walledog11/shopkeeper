import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { mockGetOrCreateOrg, mockRateLimit } = vi.hoisted(() => ({
  mockGetOrCreateOrg: vi.fn(),
  mockRateLimit: vi.fn(),
}));

vi.mock('@/lib/server/org', () => ({
  getOrCreateOrg: mockGetOrCreateOrg,
}));

vi.mock('@/lib/server/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/rate-limit')>(
    '@/lib/server/rate-limit',
  );
  return {
    ...actual,
    rateLimit: mockRateLimit,
  };
});

vi.mock('@/lib/server/logger', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { withOrgRoute, assertEntityInOrg } from './route';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from './errors';

const ORG = {
  id: 'org_1',
  stripeStatus: 'active' as string | null,
};

function makeRequest() {
  return new Request('http://localhost/api/x');
}

describe('withOrgRoute', () => {
  beforeEach(() => {
    mockGetOrCreateOrg.mockResolvedValue(ORG);
    mockRateLimit.mockResolvedValue({ success: true, remaining: 10, reset: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invokes the handler with the resolved org', async () => {
    const handler = vi.fn(async ({ org }) => NextResponse.json({ id: org.id }));
    const route = withOrgRoute(
      { context: 'Test', errorMessage: 'failed' },
      handler,
    );

    const res = await route(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'org_1' });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('passes awaited dynamic route params to the handler', async () => {
    const handler = vi.fn(async ({ params }: { params: { id: string } }) =>
      NextResponse.json({ id: params.id }),
    );
    const route = withOrgRoute<{ id: string }>(
      { context: 'Test', errorMessage: 'failed' },
      handler,
    );

    const res = await route(makeRequest(), { params: Promise.resolve({ id: 'abc' }) });

    expect(await res.json()).toEqual({ id: 'abc' });
  });

  it('maps ApiError throws to their status and JSON shape', async () => {
    const route = withOrgRoute(
      { context: 'Test', errorMessage: 'failed' },
      async () => {
        throw new BadRequestError('bad input');
      },
    );

    const res = await route(makeRequest());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad input' });
  });

  it('returns 401 when getOrCreateOrg throws UnauthorizedError', async () => {
    mockGetOrCreateOrg.mockRejectedValueOnce(new UnauthorizedError());
    const route = withOrgRoute(
      { context: 'Test', errorMessage: 'failed' },
      async () => NextResponse.json({}),
    );

    const res = await route(makeRequest());

    expect(res.status).toBe(401);
  });

  it('returns 500 with the configured fallback message for unknown errors', async () => {
    const route = withOrgRoute(
      { context: 'Test', errorMessage: 'fallback message' },
      async () => {
        throw new Error('boom');
      },
    );

    const res = await route(makeRequest());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'fallback message' });
  });

  it('enforces billing write gate when requested', async () => {
    mockGetOrCreateOrg.mockResolvedValueOnce({ id: 'org_1', stripeStatus: 'canceled' });
    const handler = vi.fn();
    const route = withOrgRoute(
      { context: 'Test', errorMessage: 'failed', requireBillingWriteAllowed: true },
      handler,
    );

    const res = await route(makeRequest());

    expect(res.status).toBe(402);
    expect(handler).not.toHaveBeenCalled();
  });

  it('applies rate limit with the org-scoped key and short-circuits on miss', async () => {
    mockRateLimit.mockResolvedValueOnce({ success: false, remaining: 0, reset: 1234567890 });
    const handler = vi.fn();
    const route = withOrgRoute(
      {
        context: 'Test',
        errorMessage: 'failed',
        rateLimit: { key: 'test:action', limit: 5, windowSecs: 60 },
      },
      handler,
    );

    const res = await route(makeRequest());

    expect(res.status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledWith('test:action:org_1', 5, 60);
    expect(handler).not.toHaveBeenCalled();
  });

  it('invokes onError with the org id and original error before responding', async () => {
    const onError = vi.fn();
    const route = withOrgRoute(
      { context: 'Test', errorMessage: 'failed', onError },
      async () => {
        throw new BadRequestError('bad input');
      },
    );

    const res = await route(makeRequest());

    expect(res.status).toBe(400);
    expect(onError).toHaveBeenCalledOnce();
    const [err, orgId] = onError.mock.calls[0];
    expect(err).toBeInstanceOf(BadRequestError);
    expect(orgId).toBe('org_1');
  });

  it('still returns the mapped error when onError itself throws', async () => {
    const onError = vi.fn().mockRejectedValue(new Error('alert system down'));
    const route = withOrgRoute(
      { context: 'Test', errorMessage: 'failed', onError },
      async () => {
        throw new BadRequestError('bad input');
      },
    );

    const res = await route(makeRequest());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad input' });
  });

  it('lets the handler run when rate limit allows it', async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const route = withOrgRoute(
      {
        context: 'Test',
        errorMessage: 'failed',
        rateLimit: { key: 'test:action', limit: 5, windowSecs: 60 },
      },
      handler,
    );

    const res = await route(makeRequest());

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('assertEntityInOrg', () => {
  it('throws NotFoundError when entity is null', () => {
    expect(() => assertEntityInOrg(null, 'org_1')).toThrow(NotFoundError);
  });

  it('throws NotFoundError when org does not match', () => {
    expect(() => assertEntityInOrg({ organizationId: 'org_other' }, 'org_1')).toThrow(
      NotFoundError,
    );
  });

  it('returns normally when org matches', () => {
    const entity = { organizationId: 'org_1', name: 'x' };
    expect(() => assertEntityInOrg(entity, 'org_1')).not.toThrow();
  });

  it('uses the provided message on the NotFoundError', () => {
    try {
      assertEntityInOrg(null, 'org_1', 'Entity not found');
    } catch (err) {
      expect((err as NotFoundError).message).toBe('Entity not found');
      return;
    }
    throw new Error('expected throw');
  });
});
