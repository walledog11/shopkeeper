import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, SenderType, db } from '@clerk/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@clerk/db/test-helpers';

const {
  mockCreateInvitation,
  mockDeleteMembership,
  mockFetch,
  mockGetInvitations,
  mockGetMemberships,
  mockRateLimit,
  mockRevokeInvitation,
} = vi.hoisted(() => ({
  mockCreateInvitation: vi.fn(),
  mockDeleteMembership: vi.fn(),
  mockFetch: vi.fn(),
  mockGetInvitations: vi.fn(),
  mockGetMemberships: vi.fn(),
  mockRateLimit: vi.fn(),
  mockRevokeInvitation: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  rateLimit: mockRateLimit,
  tooManyRequests: (reset: number) => Response.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'X-RateLimit-Reset': String(reset) } },
  ),
}));

vi.stubGlobal('fetch', mockFetch);

import { auth, clerkClient } from '@clerk/nextjs/server';
import { GET as getAnalytics } from '@/app/api/analytics/route';
import { GET as getIntegrations } from '@/app/api/integrations/route';
import { GET as getKb } from '@/app/api/kb/route';
import { GET as getOrders } from '@/app/api/orders/route';
import { GET as getOrgData, DELETE as deleteOrgData } from '@/app/api/org/data/route';
import { GET as getReports } from '@/app/api/reports/route';
import { GET as getGdprReport } from '@/app/api/reports/gdpr/route';
import { GET as getShopifyCustomer } from '@/app/api/shopify/customer/route';
import { GET as getShopifyCustomers } from '@/app/api/shopify/customers/route';
import { GET as getProducts } from '@/app/api/shopify/products/route';
import { POST as createShopifyThread } from '@/app/api/threads/shopify/route';
import { GET as getTeam, POST as inviteTeamMember, DELETE as removeTeamMember } from '@/app/api/team/route';

let callerOrg: Awaited<ReturnType<typeof createTestOrg>>;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  callerOrg = await createTestOrg();
  otherOrg = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_caller',
    orgId: callerOrg.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  vi.mocked(clerkClient).mockResolvedValue({
    organizations: {
      createOrganizationInvitation: mockCreateInvitation,
      deleteOrganizationMembership: mockDeleteMembership,
      getOrganizationInvitationList: mockGetInvitations,
      getOrganizationMembershipList: mockGetMemberships,
      revokeOrganizationInvitation: mockRevokeInvitation,
    },
  } as unknown as Awaited<ReturnType<typeof clerkClient>>);
  mockRateLimit.mockResolvedValue({ success: true, remaining: 99, reset: 1234 });
});

afterEach(async () => {
  await cleanupTestData(callerOrg?.id);
  await cleanupTestData(otherOrg?.id);
  vi.clearAllMocks();
});

describe('tenant data surfaces', () => {
  it('lists only the active organization data for KB, integrations, and org export', async () => {
    const callerCustomer = await createTestCustomer(callerOrg.id, 'caller-list@example.com', { name: 'Caller List' });
    const callerThread = await createTestThread(callerOrg.id, callerCustomer.id, ChannelType.email, { tag: 'CallerTag' });
    await createTestMessage(callerThread.id, 'caller export message');
    const otherCustomer = await createTestCustomer(otherOrg.id, 'foreign-list@example.com', { name: 'Foreign List' });
    const otherThread = await createTestThread(otherOrg.id, otherCustomer.id, ChannelType.email, { tag: 'ForeignTag' });
    await createTestMessage(otherThread.id, 'foreign export message');

    const callerKb = await db.knowledgeBase.create({
      data: { organizationId: callerOrg.id, name: 'Caller KB', source: 'user' },
    });
    await db.kbArticle.create({
      data: { organizationId: callerOrg.id, knowledgeBaseId: callerKb.id, title: 'Caller Article', body: 'caller body' },
    });
    const otherKb = await db.knowledgeBase.create({
      data: { organizationId: otherOrg.id, name: 'Foreign KB', source: 'user' },
    });
    await db.kbArticle.create({
      data: { organizationId: otherOrg.id, knowledgeBaseId: otherKb.id, title: 'Foreign Article', body: 'foreign body' },
    });
    await createTestIntegration(callerOrg.id, { platform: ChannelType.email, externalAccountId: 'caller@example.com' });
    await createTestIntegration(otherOrg.id, { platform: ChannelType.email, externalAccountId: 'foreign@example.com' });
    await db.cannedResponse.create({
      data: { organizationId: callerOrg.id, title: 'Caller Canned', body: 'caller canned', tags: [], channels: [] },
    });
    await db.cannedResponse.create({
      data: { organizationId: otherOrg.id, title: 'Foreign Canned', body: 'foreign canned', tags: [], channels: [] },
    });

    const kbBody = await json<{ knowledgeBases: Array<{ name: string; articles: Array<{ title: string }> }> }>(await getKb());
    expect(kbBody.knowledgeBases.map(kb => kb.name)).toEqual(['Caller KB']);
    expect(kbBody.knowledgeBases[0].articles.map(article => article.title)).toEqual(['Caller Article']);

    const integrationsBody = await json<Array<{ externalAccountId: string }>>(await getIntegrations());
    expect(integrationsBody.map(integration => integration.externalAccountId)).toEqual(['caller@example.com']);

    const exportResponse = await getOrgData(new Request('http://localhost/api/org/data?action=export'));
    const exportBody = await json<{
      customers: Array<{ platformId: string }>;
      threads: Array<{ id: string; messages: Array<{ contentText: string | null }> }>;
      kbArticles: Array<{ title: string }>;
      cannedResponses: Array<{ title: string }>;
    }>(exportResponse);
    expect(exportBody.customers.map(customer => customer.platformId)).toEqual(['caller-list@example.com']);
    expect(exportBody.threads.map(thread => thread.id)).toEqual([callerThread.id]);
    expect(exportBody.threads[0].messages.map(message => message.contentText)).toEqual(['caller export message']);
    expect(exportBody.kbArticles.map(article => article.title)).toEqual(['Caller Article']);
    expect(exportBody.cannedResponses.map(response => response.title)).toEqual(['Caller Canned']);
  });

  it('keeps reports and analytics aggregates scoped to the active organization', async () => {
    const callerCustomer = await createTestCustomer(callerOrg.id, 'caller-analytics@example.com', { name: 'Caller Analytics' });
    const callerThread = await createTestThread(callerOrg.id, callerCustomer.id, ChannelType.email, { tag: 'CallerTag' });
    await createTestMessage(callerThread.id, 'caller asked');
    await createTestMessage(callerThread.id, 'caller answered', SenderType.agent);

    const otherCustomer = await createTestCustomer(otherOrg.id, 'foreign-analytics@example.com', { name: 'Foreign Analytics' });
    const otherThread = await createTestThread(otherOrg.id, otherCustomer.id, ChannelType.shopify, { tag: 'ForeignTag' });
    await createTestMessage(otherThread.id, 'foreign asked');
    await createTestMessage(otherThread.id, 'foreign answered', SenderType.agent);

    const url = 'http://localhost/api/reports?from=2020-01-01T00:00:00.000Z&to=2030-01-01T00:00:00.000Z';
    const reportsBody = await json<{
      support: { total: number; byTag: Array<{ tag: string; count: number }>; byChannel: Array<{ channel: string; count: number }> };
      customers: { top: Array<{ platformId: string }> };
    }>(await getReports(new Request(url)));
    expect(reportsBody.support.total).toBe(1);
    expect(reportsBody.support.byTag).toEqual([{ tag: 'CallerTag', count: 1 }]);
    expect(reportsBody.support.byChannel).toEqual([{ channel: 'email', count: 1 }]);
    expect(reportsBody.customers.top.map(customer => customer.platformId)).toEqual(['caller-analytics@example.com']);

    const analyticsBody = await json<{
      threads: { total: number; byTag: Array<{ tag: string; count: number }>; byChannel: Array<{ channel: string; count: number }> };
      messages: { total: number; bySender: Record<string, number> };
    }>(await getAnalytics(new Request(url.replace('/reports', '/analytics'))));
    expect(analyticsBody.threads.total).toBe(1);
    expect(analyticsBody.threads.byTag).toEqual([{ tag: 'CallerTag', count: 1 }]);
    expect(analyticsBody.threads.byChannel).toEqual([{ channel: 'email', count: 1 }]);
    expect(analyticsBody.messages.total).toBe(2);
    expect(analyticsBody.messages.bySender.customer).toBe(1);
    expect(analyticsBody.messages.bySender.agent).toBe(1);
  });

  it('exports GDPR customer data only for the active organization even when another org has the same email', async () => {
    const sharedEmail = 'shared-customer@example.com';
    const callerCustomer = await createTestCustomer(callerOrg.id, sharedEmail, { name: 'Caller Shared' });
    const callerThread = await createTestThread(callerOrg.id, callerCustomer.id, ChannelType.email);
    await createTestMessage(callerThread.id, 'caller private message');

    const foreignCustomer = await createTestCustomer(otherOrg.id, sharedEmail, { name: 'Foreign Shared' });
    const foreignThread = await createTestThread(otherOrg.id, foreignCustomer.id, ChannelType.email);
    await createTestMessage(foreignThread.id, 'foreign private message');

    const res = await getGdprReport(new Request(`http://localhost/api/reports/gdpr?email=${encodeURIComponent(sharedEmail)}`));
    const bodyText = await res.text();

    expect(res.status).toBe(200);
    expect(bodyText).toContain('caller private message');
    expect(bodyText).toContain('Caller Shared');
    expect(bodyText).not.toContain('foreign private message');
    expect(bodyText).not.toContain('Foreign Shared');
  });

  it('archives only the active organization tickets on org data delete actions', async () => {
    const callerCustomer = await createTestCustomer(callerOrg.id, 'caller-delete@example.com');
    const callerThread = await createTestThread(callerOrg.id, callerCustomer.id, ChannelType.email);
    const foreignCustomer = await createTestCustomer(otherOrg.id, 'foreign-delete@example.com');
    const foreignThread = await createTestThread(otherOrg.id, foreignCustomer.id, ChannelType.email);

    const res = await deleteOrgData(new Request('http://localhost/api/org/data?action=clear_tickets', { method: 'DELETE' }));

    expect(res.status).toBe(200);
    const callerUpdated = await db.thread.findUniqueOrThrow({ where: { id: callerThread.id } });
    const foreignUpdated = await db.thread.findUniqueOrThrow({ where: { id: foreignThread.id } });
    expect(callerUpdated.archivedAt).not.toBeNull();
    expect(foreignUpdated.archivedAt).toBeNull();
  });

  it('does not use Shopify credentials from another organization', async () => {
    await createTestIntegration(otherOrg.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'foreign-shop.myshopify.com',
      accessToken: 'foreign-token',
    });

    const routes = [
      getShopifyCustomer(new Request('http://localhost/api/shopify/customer?email=alice@example.com')),
      getShopifyCustomers(new Request('http://localhost/api/shopify/customers?q=alice')),
      getProducts(new Request('http://localhost/api/shopify/products?q=shirt')),
      getOrders(new Request('http://localhost/api/orders?q=1001')),
    ];

    const responses = await Promise.all(routes);
    expect(responses.map(response => response.status)).toEqual([404, 404, 404, 404]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses the active organization Shopify integration for customer lookups and local name persistence', async () => {
    const email = 'shopify-customer@example.com';
    const callerCustomer = await createTestCustomer(callerOrg.id, email, { name: email });
    const foreignCustomer = await createTestCustomer(otherOrg.id, email, { name: 'Foreign Existing' });
    await createTestIntegration(callerOrg.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'caller-shop.myshopify.com',
      accessToken: 'caller-token',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({
      customers: [{
        id: 123,
        first_name: 'Caller',
        last_name: 'Shopper',
        email,
        phone: null,
        note: null,
        orders_count: 0,
        total_spent: '0.00',
        created_at: '2026-01-01T00:00:00Z',
        default_address: null,
      }],
    }));

    const res = await getShopifyCustomer(new Request(`http://localhost/api/shopify/customer?email=${encodeURIComponent(email)}&orderLimit=0`));

    expect(res.status).toBe(200);
    expect(String(mockFetch.mock.calls[0][0])).toContain('https://caller-shop.myshopify.com/admin/api/2026-04/customers/search.json');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ headers: { 'X-Shopify-Access-Token': 'caller-token' } });

    const callerUpdated = await db.customer.findUniqueOrThrow({ where: { id: callerCustomer.id } });
    const foreignUnchanged = await db.customer.findUniqueOrThrow({ where: { id: foreignCustomer.id } });
    expect(callerUpdated.name).toBe('Caller Shopper');
    expect(foreignUnchanged.name).toBe('Foreign Existing');
  });

  it('uses the active organization Shopify integration for product browsing', async () => {
    await createTestIntegration(callerOrg.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'caller-products.myshopify.com',
      accessToken: 'caller-product-token',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({
      products: [{
        id: 456,
        title: 'Caller Tee',
        status: 'active',
        vendor: 'Caller',
        product_type: 'Shirt',
        tags: 'summer, tee',
        images: [{ src: 'https://cdn.example/tee.png', alt: null }],
        variants: [{
          id: 789,
          title: 'Default',
          price: '20.00',
          sku: 'TEE',
          inventory_quantity: 5,
          compare_at_price: null,
        }],
      }],
    }));

    const res = await getProducts(new Request('http://localhost/api/shopify/products?q=tee'));
    const body = await json<{ shop: string; products: Array<{ title: string; tags: string[] }> }>(res);

    expect(res.status).toBe(200);
    expect(String(mockFetch.mock.calls[0][0])).toContain('https://caller-products.myshopify.com/admin/api/2026-04/products.json');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ headers: { 'X-Shopify-Access-Token': 'caller-product-token' } });
    expect(body.shop).toBe('caller-products.myshopify.com');
    expect(body.products).toEqual([expect.objectContaining({ title: 'Caller Tee', tags: ['summer', 'tee'] })]);
  });

  it('creates Shopify-started threads in the active organization without mutating a foreign customer', async () => {
    const email = 'thread-shopify@example.com';
    const foreignCustomer = await createTestCustomer(otherOrg.id, email, { name: 'Foreign Thread Customer' });

    const res = await createShopifyThread(jsonReq('http://localhost/api/threads/shopify', {
      shopifyCustomerId: '9988',
      customerEmail: email,
      customerName: 'Caller Thread Customer',
      orderName: '#1001',
    }));

    expect(res.status).toBe(200);
    const body = await json<{ threadId: string; isNew: boolean }>(res);
    expect(body.isNew).toBe(true);

    const thread = await db.thread.findUniqueOrThrow({ where: { id: body.threadId }, include: { customer: true } });
    expect(thread.organizationId).toBe(callerOrg.id);
    expect(thread.customer.organizationId).toBe(callerOrg.id);
    expect(thread.customer.name).toBe('Caller Thread Customer');
    expect(thread.shopifyCustomerId).toBe('9988');
    expect(thread.tag).toBe('Order #1001');

    const foreignUnchanged = await db.customer.findUniqueOrThrow({ where: { id: foreignCustomer.id } });
    expect(foreignUnchanged.name).toBe('Foreign Thread Customer');
    await expect(db.thread.count({ where: { organizationId: otherOrg.id, customerId: foreignCustomer.id } })).resolves.toBe(0);
  });

  it('passes only the active Clerk organization to team membership APIs', async () => {
    mockGetMemberships.mockResolvedValue({
      data: [{
        id: 'mem_1',
        publicUserData: { userId: 'usr_member', firstName: 'Ada', lastName: 'Lovelace', imageUrl: null, identifier: 'ada@example.com' },
        role: 'org:member',
        createdAt: 1_700_000_000_000,
      }],
    });
    mockGetInvitations.mockResolvedValue({ data: [] });
    mockCreateInvitation.mockResolvedValue({
      id: 'inv_1',
      emailAddress: 'new@example.com',
      role: 'org:member',
      createdAt: 1_700_000_000_000,
    });

    const getRes = await getTeam();
    expect(getRes.status).toBe(200);
    expect(mockGetMemberships).toHaveBeenCalledWith({ organizationId: callerOrg.clerkOrgId, limit: 100 });
    expect(mockGetInvitations).toHaveBeenCalledWith({ organizationId: callerOrg.clerkOrgId, status: ['pending'] });

    const postRes = await inviteTeamMember(jsonReq('http://localhost/api/team', {
      emailAddress: 'new@example.com',
      role: 'org:owner',
    }));
    expect(postRes.status).toBe(200);
    expect(mockCreateInvitation).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: callerOrg.clerkOrgId,
      inviterUserId: 'usr_caller',
      role: 'org:member',
    }));

    const deleteRes = await removeTeamMember(new Request('http://localhost/api/team?userId=usr_member', { method: 'DELETE' }));
    expect(deleteRes.status).toBe(200);
    expect(mockDeleteMembership).toHaveBeenCalledWith({ organizationId: callerOrg.clerkOrgId, userId: 'usr_member' });
  });
});

async function json<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
}
