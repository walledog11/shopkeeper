import { describe, it, expect, vi, beforeAll } from 'vitest';

type MiddlewareHandler = (
  auth: {
    (): Promise<{ userId: string | null; orgId: string | null }>;
    protect: () => Promise<unknown>;
  },
  req: {
    nextUrl: { pathname: string; search: string };
    url: string;
    headers: { get: (name: string) => string | null };
  }
) => Promise<Response | undefined>;

let capturedHandler: MiddlewareHandler;
let capturedOptions: {
  contentSecurityPolicy?: {
    strict?: boolean;
    reportOnly?: boolean;
    reportTo?: string;
    directives?: Record<string, string[]>;
  };
};

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (handler: MiddlewareHandler, options: typeof capturedOptions) => {
    capturedHandler = handler;
    capturedOptions = options;
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

function makeReq(pathname: string, host: string | null = null) {
  return {
    nextUrl: { pathname, search: '' },
    url: `http://localhost${pathname}`,
    headers: { get: (name: string) => (name === 'host' ? host : null) },
  };
}

describe('proxy middleware auth handling', () => {
  it('returns 401 JSON for unauthenticated requests to protected API paths', async () => {
    const { fn } = makeAuth(null, null);
    const res = await capturedHandler(fn as never, makeReq('/api/threads'));
    expect(res?.status).toBe(401);
    expect(await res?.json()).toEqual({ error: 'Unauthorized' });
  });

  it('lets public API paths through without auth', async () => {
    const { fn } = makeAuth(null, null);
    const res = await capturedHandler(fn as never, makeReq('/api/health'));
    expect(res).toBeUndefined();
  });

  it('lets browsers submit CSP reports without an authenticated session', async () => {
    const { fn } = makeAuth(null, null);
    const res = await capturedHandler(fn as never, makeReq('/api/security/csp-report'));
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

  it('lets signed-in users access /login for account switching', async () => {
    const { fn } = makeAuth('usr_1', null);
    const res = await capturedHandler(fn as never, makeReq('/login'));
    expect(res).toBeUndefined();
  });

  it('redirects signed-in users away from /signup to /dashboard', async () => {
    const { fn } = makeAuth('usr_1', null);
    const res = await capturedHandler(fn as never, makeReq('/signup'));
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toContain('/dashboard');
  });
});

describe('proxy canonical host handling', () => {
  it('sends app surfaces on a sibling host to the APP_URL host before touching auth', async () => {
    vi.stubEnv('APP_URL', 'https://app.useshopkeeper.com');
    const { fn } = makeAuth(null, null);
    const res = await capturedHandler(fn as never, makeReq('/onboarding', 'useshopkeeper.com'));
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toBe('https://app.useshopkeeper.com/onboarding');
    expect(fn).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_AUTH_BYPASS', 'false');
  });
});

describe('proxy content security policy', () => {
  it('requests a nonce-based strict policy that stays report-only', () => {
    expect(capturedOptions.contentSecurityPolicy).toMatchObject({
      strict: true,
      reportOnly: true,
      reportTo: '/api/security/csp-report',
    });
  });

  it('no longer asks for unsafe-inline or unsafe-eval in script-src', () => {
    const scriptSrc = capturedOptions.contentSecurityPolicy?.directives?.['script-src'] ?? [];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('keeps the non-Clerk directives the app depends on', () => {
    const directives = capturedOptions.contentSecurityPolicy?.directives ?? {};
    expect(directives['connect-src']).toEqual(
      expect.arrayContaining(['https://*.ingest.us.sentry.io']),
    );
    expect(directives['media-src']).toEqual(
      expect.arrayContaining(['https://*.public.blob.vercel-storage.com']),
    );
    expect(directives['frame-ancestors']).toEqual(["'self'"]);
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['report-uri']).toEqual(['/api/security/csp-report']);
  });
});
