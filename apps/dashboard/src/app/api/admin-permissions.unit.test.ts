import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Route-by-role sweep for the admin-only surface (P5-02).

// Same shape as the billing write-gate sweep: the role check fires inside
// withOrgRoute before the handler runs, so mocking org resolution and the Clerk
// session is enough — a denied caller never reaches a handler body, so no DB or
// provider call happens on the paths asserted here.
const { mockGetOrCreateOrg, mockAuth } = vi.hoisted(() => ({
  mockGetOrCreateOrg: vi.fn(),
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/server/org', () => ({
  getOrCreateOrg: mockGetOrCreateOrg,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { PATCH as orgPatch } from './org/route';
import { DELETE as orgDataDelete } from './org/data/route';
import { POST as billingCheckout } from './billing/checkout/route';
import { POST as billingPortal } from './billing/portal/route';
import { POST as integrationsPost } from './integrations/route';
import { PATCH as integrationPatch, DELETE as integrationDelete } from './integrations/[id]/route';
import { PATCH as emailDefaultPatch } from './integrations/email/default/route';
import { ADMIN_REQUIRED_MESSAGE } from '@/lib/api/permissions';

type RouteHandler = (
  request?: Request,
  ctx?: { params: Promise<unknown> },
) => Promise<Response> | Response;

const ADMIN_ONLY_ROUTES: Array<{
  name: string;
  handler: RouteHandler;
  method?: string;
  params?: Record<string, string>;
}> = [
  { name: 'PATCH /api/org', handler: orgPatch, method: 'PATCH' },
  { name: 'DELETE /api/org/data', handler: orgDataDelete, method: 'DELETE' },
  { name: 'POST /api/billing/checkout', handler: billingCheckout },
  { name: 'POST /api/billing/portal', handler: billingPortal },
  { name: 'POST /api/integrations', handler: integrationsPost },
  { name: 'PATCH /api/integrations/[id]', handler: integrationPatch, method: 'PATCH', params: { id: 'int_1' } },
  { name: 'DELETE /api/integrations/[id]', handler: integrationDelete, method: 'DELETE', params: { id: 'int_1' } },
  { name: 'PATCH /api/integrations/email/default', handler: emailDefaultPatch, method: 'PATCH' },
];

function callRoute(route: (typeof ADMIN_ONLY_ROUTES)[number]) {
  const request = new Request('http://localhost/api/x?action=clear_tickets', {
    method: route.method ?? 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const ctx = route.params ? { params: Promise.resolve(route.params) } : undefined;
  return route.handler(request, ctx);
}

function setRole(orgRole: string | null) {
  mockAuth.mockResolvedValue({ userId: 'usr_1', orgId: 'org_clerk_1', orgRole });
}

beforeEach(() => {
  vi.stubEnv('E2E_AUTH_BYPASS', 'false');
  // An org in good billing standing, so a 402 can never be mistaken for a 403.
  mockGetOrCreateOrg.mockResolvedValue({ id: 'org_1', stripeStatus: 'active' });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('admin-only route sweep', () => {
  for (const orgRole of ['org:member', null] as const) {
    describe(`when the caller's role is ${orgRole ?? 'unset'}`, () => {
      beforeEach(() => {
        setRole(orgRole);
      });

      it.each(ADMIN_ONLY_ROUTES)('denies $name with 403', async (route) => {
        const res = await callRoute(route);

        expect(res.status).toBe(403);
        // Assert the 403 is the role denial, not a coincidental status from a
        // handler that ran anyway.
        const body = (await res.json()) as { error?: string };
        expect(body.error).toBe(ADMIN_REQUIRED_MESSAGE);
      });
    });
  }

  describe('when the caller is an admin', () => {
    beforeEach(() => {
      setRole('org:admin');
    });

    it.each(ADMIN_ONLY_ROUTES)('lets $name past the role check', async (route) => {
      const res = await callRoute(route);

      // The handler is reached and may fail on its own (bad body, missing
      // record, no provider) — what matters is that the role layer let it
      // through rather than short-circuiting.
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      expect(body.error).not.toBe(ADMIN_REQUIRED_MESSAGE);
    });
  });
});
