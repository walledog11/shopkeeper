import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';
import { DEFAULT_CHAT_SETTINGS } from '@/lib/storefront-chat/configuration';
import { chatImageUrl } from '@/lib/storefront-chat/images';
import { appProxyCanonicalString } from '@/lib/shopify/app-proxy';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
import { auth } from '@clerk/nextjs/server';
import { GET, PUT } from './route';
import { GET as storefrontConfig } from '@/app/api/storefront-chat/proxy/config/route';
import { PATCH as toggleChat } from '../route';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let shop: string;
let integrationId: string;
const secret = 'test-chat-config-secret';

function publish(settings: unknown = DEFAULT_CHAT_SETTINGS, revision = 0) {
  return PUT(new Request('http://localhost/api/integrations/shopify/storefront-chat/configuration', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings, revision }),
  }));
}

function storefrontRequest(domain = shop, timestamp = Math.floor(Date.now() / 1000)) {
  const url = new URL('https://app.test/api/storefront-chat/proxy/config');
  url.searchParams.set('shop', domain);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('signature', createHmac('sha256', secret).update(appProxyCanonicalString(url)).digest('hex'));
  return new Request(url);
}

beforeEach(async () => {
  org = await createTestOrg();
  shop = `config-${randomUUID()}.myshopify.com`;
  await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: 'user_chat_config' } });
  vi.mocked(auth).mockResolvedValue({ userId: 'user_chat_config', orgId: org.clerkOrgId, orgRole: 'org:admin' } as Awaited<ReturnType<typeof auth>>);
  const integration = await createTestIntegration(org.id, {
    platform: ChannelType.shopify, externalAccountId: shop,
    metadata: { retained: 'private metadata', storefrontChat: { enabled: false } },
  });
  integrationId = integration.id;
  vi.stubEnv('SHOPIFY_APP_SECRET', secret); vi.stubEnv('STOREFRONT_CHAT_ENABLED', 'true');
});
afterEach(async () => { await cleanupTestData(org?.id); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('merchant chat configuration', () => {
  it('publishes while chat is disabled, preserves metadata, and reads back normalized settings', async () => {
    expect(await (await GET()).json()).toMatchObject({ configuration: null, enabled: false });
    const result = await publish({ ...DEFAULT_CHAT_SETTINGS, title: '  My shop  ', secret: 'must not be returned' });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ configuration: { revision: 1, settings: { title: 'My shop' } } });
    const stored = await db.integration.findUniqueOrThrow({ where: { id: integrationId } });
    expect(stored.metadata).toMatchObject({ retained: 'private metadata', storefrontChat: { enabled: false, configuration: { revision: 1 } } });
    const loaded = await (await GET()).json();
    expect(loaded.configuration.settings.secret).toBeUndefined();
    expect(JSON.stringify(loaded)).not.toContain('private metadata');
    expect((await (await storefrontConfig(storefrontRequest())).json()).enabled).toBe(false);
  });

  it('rejects a stale publish and preserves a published configuration when toggling chat', async () => {
    expect((await publish()).status).toBe(200);
    expect((await publish({ ...DEFAULT_CHAT_SETTINGS, title: 'Stale draft' })).status).toBe(409);
    expect((await publish({ ...DEFAULT_CHAT_SETTINGS, title: 'Latest draft' }, 1)).status).toBe(200);
    const toggle = await toggleChat(new Request('http://localhost/api/integrations/shopify/storefront-chat', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }),
    }));
    expect(toggle.status).toBe(200);
    expect((await (await GET()).json()).configuration.settings.title).toBe('Latest draft');
  });

  it('allows only one concurrent publish of the same revision', async () => {
    const results = await Promise.all([
      publish({ ...DEFAULT_CHAT_SETTINGS, title: 'First tab' }),
      publish({ ...DEFAULT_CHAT_SETTINGS, title: 'Second tab' }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await (await GET()).json()).configuration.revision).toBe(1);
  });

  it('ignores blank lines in suggested questions', async () => {
    const response = await publish({ ...DEFAULT_CHAT_SETTINGS,
      quickPrompts: [' First question ', '', 'Second question', '', '', '', ''],
    });
    expect(response.status).toBe(200);
    expect((await response.json()).configuration.settings.quickPrompts).toEqual(['First question', 'Second question']);
  });

  it('keeps uploaded pictures scoped to their workspace and resolves their public URL on our app origin', async () => {
    expect((await publish({ ...DEFAULT_CHAT_SETTINGS, logoUrl: chatImageUrl(randomUUID(), randomUUID()) })).status).toBe(400);
    const logoUrl = chatImageUrl(org.id, randomUUID());
    expect((await publish({ ...DEFAULT_CHAT_SETTINGS, logoUrl })).status).toBe(200);
    expect((await (await GET()).json()).configuration.settings.logoUrl).toBe(logoUrl);
    const current = await db.integration.findUniqueOrThrow({ where: { id: integrationId } });
    const metadata = current.metadata as Record<string, unknown>;
    await db.integration.update({ where: { id: integrationId }, data: { metadata: {
      ...metadata, storefrontChat: { ...(metadata.storefrontChat as object), enabled: true },
    } } });
    vi.stubEnv('APP_URL', 'https://dashboard.example.com');
    const response = await (await storefrontConfig(storefrontRequest())).json();
    expect(response.configuration.settings.logoUrl).toBe(`https://dashboard.example.com${logoUrl}`);
  });

  it('does not expose or modify another workspace’s shop', async () => {
    const other = await createTestOrg();
    try {
      await db.orgMember.create({ data: { organizationId: other.id, clerkUserId: 'user_chat_config' } });
      vi.mocked(auth).mockResolvedValue({ userId: 'user_chat_config', orgId: other.clerkOrgId, orgRole: 'org:admin' } as Awaited<ReturnType<typeof auth>>);
      expect((await GET()).status).toBe(404);
      expect((await publish()).status).toBe(404);
      const original = await db.integration.findUniqueOrThrow({ where: { id: integrationId } });
      expect(original.metadata).toEqual({ retained: 'private metadata', storefrontChat: { enabled: false } });
    } finally { await cleanupTestData(other.id); }
  });

  it('requires an admin and a connected shop in the current workspace', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'user_chat_config', orgId: org.clerkOrgId, orgRole: 'org:member' } as Awaited<ReturnType<typeof auth>>);
    expect((await publish()).status).toBe(403);
    vi.mocked(auth).mockResolvedValue({ userId: 'user_chat_config', orgId: org.clerkOrgId, orgRole: 'org:admin' } as Awaited<ReturnType<typeof auth>>);
    await db.integration.update({ where: { id: integrationId }, data: { lifecycleStatus: 'disconnecting' } });
    expect((await publish()).status).toBe(404);
  });

  it.each([
    { accentColor: 'red;display:none' }, { logoUrl: 'javascript:alert(1)' }, { logoUrl: 'https://user:pass@example.com/image.png' },
    { offsetX: -1 }, { offsetY: 100 }, { showOnMobile: 'true' }, { quickPrompts: Array(7).fill('Question') },
  ])('rejects invalid public configuration %j', async invalid => {
    expect((await publish({ ...DEFAULT_CHAT_SETTINGS, ...invalid })).status).toBe(400);
  });

  it('returns only public settings through a signed proxy request, without creating sessions', async () => {
    await publish();
    const current = await db.integration.findUniqueOrThrow({ where: { id: integrationId } });
    const metadata = current.metadata as Record<string, unknown>;
    await db.integration.update({ where: { id: integrationId }, data: { metadata: {
      ...metadata, storefrontChat: { ...(metadata.storefrontChat as object), enabled: true },
    } } });
    const result = await storefrontConfig(storefrontRequest());
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const body = await result.json();
    expect(body).toMatchObject({ enabled: true, configuration: { revision: 1, settings: DEFAULT_CHAT_SETTINGS } });
    expect(JSON.stringify(body)).not.toContain('private metadata');
    expect(await db.storefrontChatSession.count({ where: { organizationId: org.id } })).toBe(0);
    expect((await storefrontConfig(new Request('http://localhost/api/storefront-chat/proxy/config?shop=' + shop))).status).toBe(401);
    expect((await storefrontConfig(storefrontRequest(shop, 1))).status).toBe(401);
    expect(await (await storefrontConfig(storefrontRequest('unconnected.myshopify.com'))).json()).toEqual({ enabled: false });
    vi.stubEnv('STOREFRONT_CHAT_ENABLED', 'false');
    expect(await (await storefrontConfig(storefrontRequest())).json()).toEqual({ enabled: false });
  });
});
