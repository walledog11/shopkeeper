import { describe, it, expect, vi, beforeAll } from 'vitest';

type MiddlewareHandler = (
  auth: {
    (): Promise<{ userId: string | null; orgId: string | null }>;
    protect: () => Promise<unknown>;
  },
  req: { nextUrl: { pathname: string }; url: string }
) => Promise<Response | undefined>;

let capturedHandler: MiddlewareHandler;

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (handler: MiddlewareHandler) => {
    capturedHandler = handler;
    return handler;
  },
}));

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('E2E_AUTH_BYPASS', 'false');
  await import('./proxy');
});

function makeAuth(userId: string | null, orgId: string | null) {
  const protect = vi.fn(async () => {});
  const fn = Object.assign(
    vi.fn(async () => ({ userId, orgId })),
    { protect },
  );
  return { fn, protect };
}

function makeReq(pathname: string) {
  return { nextUrl: { pathname }, url: `http://localhost${pathname}` };
}

describe('proxy middleware auth handling', () => {
  it('returns 401 JSON for unauthenticated requests to protected API paths', async () => {
    const { fn } = makeAuth(null, null);
    const res = await capturedHandler(fn as never, makeReq('/api/threads'));
    expect(res?.status).toBe(401);
    expect(await res?.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 JSON for unauthenticated requests to org-optional API paths', async () => {
    const { fn } = makeAuth(null, null);
    const res = await capturedHandler(fn as never, makeReq('/api/feedback'));
    expect(res?.status).toBe(401);
  });

  it('lets public API paths through without auth', async () => {
    const { fn } = makeAuth(null, null);
    const res = await capturedHandler(fn as never, makeReq('/api/health'));
    expect(res).toBeUndefined();
  });

  it('returns 403 JSON when authenticated but no active org for API paths', async () => {
    const { fn } = makeAuth('usr_1', null);
    const res = await capturedHandler(fn as never, makeReq('/api/threads'));
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: 'No active organization' });
  });

  it('redirects unauthenticated page requests via auth.protect()', async () => {
    const { fn, protect } = makeAuth(null, null);
    await capturedHandler(fn as never, makeReq('/dashboard/settings'));
    expect(protect).toHaveBeenCalledOnce();
  });

  it('redirects to /select-org when authenticated page request lacks an org', async () => {
    const { fn } = makeAuth('usr_1', null);
    const res = await capturedHandler(fn as never, makeReq('/dashboard/settings'));
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toContain('/select-org');
  });

  it('passes through fully authenticated requests', async () => {
    const { fn } = makeAuth('usr_1', 'org_1');
    const res = await capturedHandler(fn as never, makeReq('/api/threads'));
    expect(res).toBeUndefined();
  });

  it('redirects signed-in users away from /login to /dashboard', async () => {
    const { fn } = makeAuth('usr_1', null);
    const res = await capturedHandler(fn as never, makeReq('/login'));
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toContain('/dashboard');
  });

  it('redirects signed-in users away from /signup to /dashboard', async () => {
    const { fn } = makeAuth('usr_1', null);
    const res = await capturedHandler(fn as never, makeReq('/signup'));
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toContain('/dashboard');
  });
});
