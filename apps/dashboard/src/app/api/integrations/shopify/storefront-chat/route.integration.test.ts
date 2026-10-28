import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { GET, PATCH } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

beforeEach(async () => {
  org = await createTestOrg();
  await db.orgMember.create({
    data: { organizationId: org.id, clerkUserId: 'usr_storefront_chat' },
  });
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_storefront_chat',
    orgId: org.clerkOrgId,
    orgRole: 'org:admin',
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  vi.stubEnv('STOREFRONT_CHAT_ENABLED', 'true');
  vi.stubEnv('STOREFRONT_CHAT_SIGNING_SECRET', 'storefront-test-secret-with-32-characters');
  vi.stubEnv('SHOPIFY_APP_SECRET', 'shopify-test-secret');
  vi.stubEnv('INTERNAL_API_SECRET', 'internal-test-secret');
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function patchStorefrontChat(enabled: boolean) {
  return PATCH(
    new Request('http://localhost/api/integrations/shopify/storefront-chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }),
  );
}

describe('PATCH /api/integrations/shopify/storefront-chat', () => {
  it('returns 400 when no Shopify integration is connected', async () => {
    const response = await patchStorefrontChat(true);
    expect(response.status).toBe(400);
  });

  it('enables storefront chat while preserving unrelated metadata', async () => {
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'merchant.myshopify.com',
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['read_orders', 'read_products', 'write_app_proxy'], retained: 'value' },
    });

    const response = await patchStorefrontChat(true);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true, globallyEnabled: true });

    const saved = await db.integration.findUniqueOrThrow({ where: { id: integration.id } });
    expect(saved.metadata).toEqual({
      oauthScopes: ['read_orders', 'read_products', 'write_app_proxy'],
      retained: 'value',
      storefrontChat: { enabled: true },
    });
  });

  it('reports incomplete setup and refuses activation until required configuration is present', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify, accessToken: 'shpat_test', externalAccountId: 'merchant.myshopify.com',
      metadata: { oauthScopes: ['read_orders', 'read_products', 'write_app_proxy'] },
    });
    vi.stubEnv('STOREFRONT_CHAT_SIGNING_SECRET', '');
    const response = await GET(new Request('http://localhost/api/integrations/shopify/storefront-chat'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.canEnable).toBe(false);
    expect(body.checks.find((check: { id: string }) => check.id === 'service').ready).toBe(false);
    expect(body.checks.find((check: { id: string }) => check.id === 'email').ready).toBe(false);
    expect((await patchStorefrontChat(true)).status).toBe(400);
    vi.stubEnv('STOREFRONT_CHAT_SIGNING_SECRET', 'storefront-test-secret-with-32-characters');
    expect((await patchStorefrontChat(true)).status).toBe(200);
  });

  it('rejects enabling when the platform kill switch is off', async () => {
    vi.stubEnv('STOREFRONT_CHAT_ENABLED', 'false');
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'merchant.myshopify.com',
    });

    const response = await patchStorefrontChat(true);
    expect(response.status).toBe(400);
  });

  it('revokes active sessions when storefront chat is disabled', async () => {
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'merchant.myshopify.com',
      metadata: { storefrontChat: { enabled: true } },
    });
    const session = await db.storefrontChatSession.create({
      data: {
        organizationId: org.id,
        integrationId: integration.id,
        storefrontHost: 'merchant.myshopify.com',
        resumeSecretHash: 'a'.repeat(64),
        expiresAt: FUTURE,
      },
    });

    const response = await patchStorefrontChat(false);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false, globallyEnabled: true });

    const reloaded = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(reloaded.revokedAt).not.toBeNull();
  });
});
