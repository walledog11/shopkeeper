import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The billing write-gate fires inside withOrgRoute before the handler runs, so
// mocking org resolution is enough to exercise it — the route handlers (and
// their DB/Shopify/LLM side effects) are never reached on a blocked org.
const { mockGetOrCreateOrg } = vi.hoisted(() => ({
  mockGetOrCreateOrg: vi.fn(),
}));

vi.mock('@/lib/server/org', () => ({
  getOrCreateOrg: mockGetOrCreateOrg,
}));

vi.mock('@/lib/server/logger', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST as agentAsk } from './agent/ask/route';
import { POST as aiSummary } from './ai/summary/route';
import { POST as threadsShopify } from './threads/shopify/route';
import { PATCH as shopifyCustomerPatch } from './shopify/customer/route';
import { POST as shopifyCustomersPost } from './shopify/customers/route';
import { POST as kbBasesPost } from './kb/bases/route';
import { POST as kbArticlePost } from './kb/bases/[id]/articles/route';
import { PATCH as kbArticlePatch } from './kb/[id]/route';
import { POST as integrationsPost } from './integrations/route';
import { POST as imessageBindPost } from './integrations/imessage/bind/route';
import { POST as shopifyKbSyncPost } from './integrations/shopify/kb-sync/route';
import { POST as telegramPost } from './integrations/telegram/route';

type RouteHandler = (
  request?: Request,
  ctx?: { params: Promise<unknown> },
) => Promise<Response> | Response;

const GATED_ROUTES: Array<{ name: string; handler: RouteHandler; params?: Record<string, string> }> = [
  { name: 'POST /api/agent/ask', handler: agentAsk },
  { name: 'POST /api/ai/summary', handler: aiSummary },
  { name: 'POST /api/threads/shopify', handler: threadsShopify },
  { name: 'PATCH /api/shopify/customer', handler: shopifyCustomerPatch },
  { name: 'POST /api/shopify/customers', handler: shopifyCustomersPost },
  { name: 'POST /api/kb/bases', handler: kbBasesPost },
  { name: 'POST /api/kb/bases/[id]/articles', handler: kbArticlePost, params: { id: 'kb_1' } },
  { name: 'PATCH /api/kb/[id]', handler: kbArticlePatch, params: { id: 'art_1' } },
  { name: 'POST /api/integrations', handler: integrationsPost },
  { name: 'POST /api/integrations/imessage/bind', handler: imessageBindPost },
  { name: 'POST /api/integrations/shopify/kb-sync', handler: shopifyKbSyncPost },
  { name: 'POST /api/integrations/telegram', handler: telegramPost },
];

function makeRequest() {
  return new Request('http://localhost/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

function callRoute(route: (typeof GATED_ROUTES)[number]) {
  const ctx = route.params ? { params: Promise.resolve(route.params) } : undefined;
  return route.handler(makeRequest(), ctx);
}

describe('billing write-gate route sweep', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  for (const status of ['past_due', 'canceled'] as const) {
    describe(`when billing is ${status}`, () => {
      beforeEach(() => {
        mockGetOrCreateOrg.mockResolvedValue({ id: 'org_1', stripeStatus: status });
      });

      it.each(GATED_ROUTES)('blocks $name with the gate 402', async (route) => {
        const res = await callRoute(route);
        expect(res.status).toBe(402);
        // Assert the 402 is the billing gate, not a coincidental status from a
        // handler that ran: a blocked org must never reach the handler body.
        const body = (await res.json()) as { error?: string };
        expect(body.error).toContain('blocks write actions');
      });
    });
  }
});
