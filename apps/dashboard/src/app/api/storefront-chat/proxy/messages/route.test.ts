import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';
import { appProxyCanonicalString } from '@/lib/shopify/app-proxy';
import { createResumeSecret, mintSessionToken } from '@/lib/storefront-chat/session-token';
import { GET } from './route';

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
    await expect(response.json()).resolves.toEqual({ messages: [] });
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
