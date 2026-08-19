import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { appProxyCanonicalString } from '@/lib/shopify/app-proxy';
import { createResumeSecret, mintSessionToken } from '@/lib/storefront-chat/session-token';
import { GET, POST } from './route';

const APP_SECRET = 'storefront-messages-gate-secret';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let integration: Awaited<ReturnType<typeof createTestIntegration>>;
let session: { id: string };
let token: string;
let envBackup: Record<string, string | undefined>;

function signedGetRequest() {
  const url = new URL('https://app.useshopkeeper.com/api/storefront-chat/proxy/messages');
  url.searchParams.set('shop', integration.externalAccountId);
  url.searchParams.set('path_prefix', '/apps/shopkeeper-chat');
  url.searchParams.set('timestamp', String(Math.floor(Date.now() / 1000)));
  url.searchParams.set(
    'signature',
    createHmac('sha256', APP_SECRET).update(appProxyCanonicalString(url)).digest('hex'),
  );

  return new Request(url, { headers: { Authorization: `Bearer ${token}` } });
}

function signedPostRequest(headers: Record<string, string> = {}) {
  const url = new URL('https://app.useshopkeeper.com/api/storefront-chat/proxy/messages');
  url.searchParams.set('shop', integration.externalAccountId);
  url.searchParams.set('path_prefix', '/apps/shopkeeper-chat');
  url.searchParams.set('timestamp', String(Math.floor(Date.now() / 1000)));
  url.searchParams.set(
    'signature',
    createHmac('sha256', APP_SECRET).update(appProxyCanonicalString(url)).digest('hex'),
  );

  return new Request(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ text: 'Do you ship to Canada?', clientMessageId: 'widget-1' }),
  });
}

async function setStorefrontChat(enabled: boolean) {
  await db.integration.update({
    where: { id: integration.id },
    data: { metadata: { storefrontChat: { enabled } } },
  });
}

beforeEach(async () => {
  envBackup = {
    SHOPIFY_APP_SECRET: process.env.SHOPIFY_APP_SECRET,
    STOREFRONT_CHAT_ENABLED: process.env.STOREFRONT_CHAT_ENABLED,
    STOREFRONT_CHAT_SIGNING_SECRET: process.env.STOREFRONT_CHAT_SIGNING_SECRET,
  };
  process.env.SHOPIFY_APP_SECRET = APP_SECRET;
  process.env.STOREFRONT_CHAT_ENABLED = 'true';
  process.env.STOREFRONT_CHAT_SIGNING_SECRET = 'storefront-messages-test-signing-secret';

  org = await createTestOrg();
  integration = await createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    externalAccountId: `gate-${randomUUID()}.myshopify.com`,
    metadata: { storefrontChat: { enabled: true } },
  });

  // A token minted while chat was enabled — the case the re-read exists for.
  session = await db.storefrontChatSession.create({
    data: {
      organizationId: org.id,
      integrationId: integration.id,
      storefrontHost: integration.externalAccountId,
      resumeSecretHash: createResumeSecret().hash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  token = mintSessionToken({
    sessionId: session.id,
    orgId: org.id,
    integrationId: integration.id,
    shop: integration.externalAccountId,
  });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('storefront chat messages gating', () => {
  it('serves an enabled session', async () => {
    const response = await GET(signedGetRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ escalated: false, messages: [] });
  });

  it('refuses a live token once the merchant disables chat', async () => {
    await setStorefrontChat(false);

    const response = await GET(signedGetRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'disabled' });
  });

  it('refuses a live token once the platform switch goes off', async () => {
    process.env.STOREFRONT_CHAT_ENABLED = 'false';

    const response = await GET(signedGetRequest());

    expect(response.status).toBe(403);
  });

  it('refuses a revoked session', async () => {
    await db.storefrontChatSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const response = await GET(signedGetRequest());

    expect(response.status).toBe(404);
  });
});

describe('storefront chat budget hop', () => {
  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = 'storefront-messages-internal-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('carries the gateway budget refusal through to the widget', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'storefront chat budget exhausted',
          denial: 'shop_budget',
          shopperMessage: "We've hit today's chat limit.",
        }),
        { status: 429, headers: { 'Retry-After': '42' } },
      ),
    );

    const response = await POST(signedPostRequest());

    // A budget refusal must not arrive as a 502. The widget renders the two
    // differently, and telling a shopper their connection failed when the shop
    // hit its ceiling sends them to fix the wrong thing.
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    await expect(response.json()).resolves.toEqual({
      error: 'rate limited',
      shopperMessage: "We've hit today's chat limit.",
    });
  });

  it('forwards the shopper address the gateway rate limits on', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ threadId: 'thread-1' }), { status: 202 }),
    );

    const response = await POST(
      signedPostRequest({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
    );

    expect(response.status).toBe(202);
    const forwarded = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    // Leading entry, not the proxy that appended itself.
    expect(forwarded.shopperIp).toBe('203.0.113.7');
    expect(forwarded.sessionId).toBe(session.id);
  });

  it.each([true, false])('forwards isNewThread=%s from the gateway', async (isNewThread) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ threadId: 'thread-1', isNewThread }), { status: 202 }),
    );

    const response = await POST(signedPostRequest());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true, isNewThread });
  });

  it('still reports a genuine gateway failure as a delivery failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));

    const response = await POST(signedPostRequest());

    expect(response.status).toBe(502);
  });
});

describe('storefront chat escalation state', () => {
  async function bindThread(escalatedAt: Date | null) {
    const customer = await createTestCustomer(org.id, `shopify_chat:${session.id}`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.shopify_chat);
    await db.thread.update({ where: { id: thread.id }, data: { escalatedAt } });
    await db.storefrontChatSession.update({
      where: { id: session.id },
      data: { threadId: thread.id },
    });
    return thread;
  }

  it('reports an escalated thread so the notice survives a reload', async () => {
    await bindThread(new Date());

    const response = await GET(signedGetRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ escalated: true });
  });

  it('reports no escalation once the merchant has replied', async () => {
    await bindThread(null);

    const response = await GET(signedGetRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ escalated: false });
  });

  it('reports no escalation before a thread exists', async () => {
    const response = await GET(signedGetRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ escalated: false, messages: [] });
  });
});
