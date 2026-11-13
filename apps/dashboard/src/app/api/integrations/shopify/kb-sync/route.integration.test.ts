import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClerkSession } from '@/test-fixtures/clerk-session';
import { graphqlResponse, jsonResponse } from '@shopkeeper/agent/testing';
import { memoryOverrideTargetTag } from '@shopkeeper/agent/kb-memory';
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

import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null;

function storeContent(content: {
  policies: { id: string; title: string; body: string }[];
  pages: { id: string; title: string; body: string }[];
}) {
  return graphqlResponse({ shop: { shopPolicies: content.policies }, pages: { nodes: content.pages } });
}

beforeEach(async () => {
  org = await createTestOrg();
  mockClerkSession({
    userId: 'usr_shopify_sync',
    orgId: org.clerkOrgId,
  });
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
    mockFetch.mockResolvedValueOnce(jsonResponse({ errors: 'unavailable' }, { status: 503 }));

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
    mockFetch.mockResolvedValueOnce(storeContent({
      policies: [{ id: 'gid://shopify/ShopPolicy/1', title: 'Returns', body: '<p>Returns &amp; exchanges</p>' }],
      pages: [{ id: 'gid://shopify/Page/2', title: 'Shipping', body: '<p>Ships&nbsp;fast</p>' }],
    }));

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ syncedPolicies: 1, syncedPages: 1 });
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://sync-shop.myshopify.com/admin/api/2026-04/graphql.json');
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

  it('removes notes for content the store no longer publishes, and only those', async () => {
    await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'sync-shop.myshopify.com',
      accessToken: 'sync-token',
    });
    const kb = await db.knowledgeBase.create({ data: { organizationId: org!.id, name: 'Shopify', source: 'shopify' } });
    const note = (title: string, tags: string[]) => db.kbArticle.create({
      data: { organizationId: org!.id, knowledgeBaseId: kb.id, title, body: title, tags },
    });
    const withdrawn = await note('Old warranty', ['shopify:policy:9']);
    await note('Merchant note', []);
    const learned = await db.knowledgeBase.create({ data: { organizationId: org!.id, name: 'Learned' } });
    await db.kbArticle.create({ data: {
      organizationId: org!.id, knowledgeBaseId: learned.id, title: 'Correction', body: 'Correction',
      tags: ['merchant-override', memoryOverrideTargetTag(withdrawn.id)],
    } });
    mockFetch.mockResolvedValueOnce(storeContent({
      policies: [{ id: 'gid://shopify/ShopPolicy/1', title: 'Returns', body: '<p>Returns</p>' }],
      pages: [],
    }));

    expect((await POST()).status).toBe(200);

    const titles = (await db.kbArticle.findMany({ where: { organizationId: org!.id }, orderBy: { title: 'asc' } }))
      .map(article => article.title);
    expect(titles).toEqual(['Merchant note', 'Returns']);
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

