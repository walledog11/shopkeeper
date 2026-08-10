import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TikTokShopOAuthCallbackConfig } from '@/lib/tiktok-shop/config';

const { mockFetch, mockUpsert } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock('@/app/api/integrations/_lib/integration-upsert', () => ({
  upsertRaceSafeIntegration: mockUpsert,
}));
vi.mock('@/lib/server/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.stubGlobal('fetch', mockFetch);

import { completeTikTokShopOAuth } from './complete-tiktok-shop-oauth';

const config: TikTokShopOAuthCallbackConfig = {
  appKey: 'app_key',
  appSecret: 'app_secret',
  appUrl: 'https://dashboard.test',
  authorizeUrl: 'https://tiktok.test/authorize',
  redirectUri: 'https://dashboard.test/api/integrations/tiktok-shop/callback',
  scopes: [],
  tokenMethod: 'POST',
  tokenUrl: 'https://tiktok.test/token',
};

beforeEach(() => {
  mockUpsert.mockResolvedValue({ id: 'integration_1' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('completeTikTokShopOAuth', () => {
  it('rejects a token response without a shop, seller, or open id', async () => {
    mockToken({ access_token: 'access' });

    await expect(complete()).resolves.toEqual({
      ok: false,
      error: 'tiktok_shop_missing_shop',
      failureCategory: 'validation_failed',
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('lets persistence failures surface as unexpected server failures', async () => {
    mockToken({ access_token: 'access', shop_id: 'shop_1' });
    mockUpsert.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(complete()).rejects.toThrow('database unavailable');
  });

  it('resolves the account id and passes reconnect data to race-safe persistence', async () => {
    mockToken({
      access_token: 'access',
      refresh_token: 'refresh',
      seller_id: 'seller_1',
      seller_name: 'Fixture Seller',
      granted_scopes: ['buyer.message'],
    });

    await expect(complete()).resolves.toEqual({ ok: true, integrationId: 'integration_1' });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      externalAccountId: 'seller_1',
      organizationId: 'org_1',
      platform: 'tiktok',
      data: expect.objectContaining({
        accessToken: 'access',
        fromEmail: 'Fixture Seller',
        refreshToken: 'refresh',
        metadata: expect.objectContaining({
          provider: 'tiktok_shop',
          scopes: ['buyer.message'],
          sellerId: 'seller_1',
        }),
      }),
    }));
  });
});

function complete() {
  return completeTikTokShopOAuth({ code: 'oauth_code', config, organizationId: 'org_1' });
}

function mockToken(data: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
}
