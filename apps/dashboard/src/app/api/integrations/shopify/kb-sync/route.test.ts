import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

import { auth } from '@clerk/nextjs/server';
import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_shopify_sync',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
});

describe('POST /api/integrations/shopify/kb-sync', () => {
  it('returns 400 without calling Shopify when no integration is connected', async () => {
    const res = await POST();

    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 502 and does not create a Shopify KB when Shopify fetch fails', async () => {
    await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'sync-shop.myshopify.com',
      accessToken: 'sync-token',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ errors: 'unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ pages: [] }));

    const res = await POST();

    expect(res.status).toBe(502);
    await expect(db.knowledgeBase.count({ where: { organizationId: org!.id, source: 'shopify' } })).resolves.toBe(0);
  });

  it('creates or updates Shopify KB articles from mocked provider responses', async () => {
    await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'sync-shop.myshopify.com',
      accessToken: 'sync-token',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        policies: [{ id: 1, title: 'Returns', body: '<p>Returns &amp; exchanges</p>' }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        pages: [{ id: 2, title: 'Shipping', body_html: '<p>Ships&nbsp;fast</p>' }],
      }));

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ syncedPolicies: 1, syncedPages: 1 });
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://sync-shop.myshopify.com/admin/api/2026-04/policies.json');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ headers: { 'X-Shopify-Access-Token': 'sync-token' } });

    const articles = await db.kbArticle.findMany({
      where: { organizationId: org!.id },
      orderBy: { title: 'asc' },
    });
    expect(articles).toEqual([
      expect.objectContaining({ title: 'Returns', body: 'Returns & exchanges', tags: ['shopify:policy:1'] }),
      expect.objectContaining({ title: 'Shipping', body: 'Ships fast', tags: ['shopify:page:2'] }),
    ]);
  });

  it('seeds demo knowledge without calling Shopify for a simulated integration', async () => {
    await db.integration.create({
      data: {
        organizationId: org!.id,
        platform: ChannelType.shopify,
        externalAccountId: 'demo-store.shopkeeper.test',
        accessToken: 'simulated-token',
        metadata: { simulated: true },
      },
    });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ syncedPolicies: 1, syncedPages: 1 });
    expect(mockFetch).not.toHaveBeenCalled();
    await expect(db.kbArticle.count({
      where: { organizationId: org!.id },
    })).resolves.toBe(2);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
