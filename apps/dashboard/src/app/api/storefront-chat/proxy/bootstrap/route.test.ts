import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';
import { appProxyCanonicalString } from '@/lib/shopify/app-proxy';
import { POST } from './route';

const APP_SECRET = 'storefront-gate-test-secret';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let shopDomain: string;
let envBackup: Record<string, string | undefined>;

function signedBootstrapRequest() {
  const url = new URL('https://app.useshopkeeper.com/api/storefront-chat/proxy/bootstrap');
  url.searchParams.set('shop', shopDomain);
  url.searchParams.set('path_prefix', '/apps/shopkeeper-chat');
  url.searchParams.set('timestamp', String(Math.floor(Date.now() / 1000)));
  url.searchParams.set(
    'signature',
    createHmac('sha256', APP_SECRET).update(appProxyCanonicalString(url)).digest('hex'),
  );

  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageUrl: 'https://shop.example.test/products/thing' }),
  });
}

async function connectStore(storefrontChat?: Record<string, unknown>) {
  return createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    externalAccountId: shopDomain,
    metadata: storefrontChat ? { storefrontChat } : {},
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
  process.env.STOREFRONT_CHAT_SIGNING_SECRET = 'storefront-gate-test-signing-secret';

  org = await createTestOrg();
  shopDomain = `gate-${randomUUID()}.myshopify.com`;
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('storefront chat bootstrap gating', () => {
  it('refuses when the platform switch is off, before any session exists', async () => {
    await connectStore({ enabled: true });
    process.env.STOREFRONT_CHAT_ENABLED = 'false';

    const response = await POST(signedBootstrapRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'disabled' });
    await expect(db.storefrontChatSession.count({ where: { organizationId: org.id } })).resolves.toBe(0);
  });

  it('refuses a connected store that has not opted in', async () => {
    await connectStore();

    const response = await POST(signedBootstrapRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'disabled' });
    await expect(db.storefrontChatSession.count({ where: { organizationId: org.id } })).resolves.toBe(0);
  });

  it('refuses a store that opted out again', async () => {
    await connectStore({ enabled: false });

    const response = await POST(signedBootstrapRequest());

    expect(response.status).toBe(403);
    await expect(db.storefrontChatSession.count({ where: { organizationId: org.id } })).resolves.toBe(0);
  });

  it('opens a session when both switches are on', async () => {
    const integration = await connectStore({ enabled: true });

    const response = await POST(signedBootstrapRequest());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { sessionId: string; resumeToken: string; token: string };
    expect(body.sessionId).toBeTruthy();
    expect(body.resumeToken).toBeTruthy();
    expect(body.token).toContain('.');

    const session = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: body.sessionId } });
    expect(session.integrationId).toBe(integration.id);
    expect(session.threadId).toBeNull();
    // The resume secret is stored hashed, never as issued.
    expect(session.resumeSecretHash).not.toBe(body.resumeToken);
  });
});
