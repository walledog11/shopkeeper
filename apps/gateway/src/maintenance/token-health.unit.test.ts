import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  checkAccess,
  exchangeToken,
  findMany,
  getConfig,
  getTikTokConfig,
  logger,
  refreshTikTokToken,
  update,
} = vi.hoisted(() => ({
  checkAccess: vi.fn(),
  exchangeToken: vi.fn(),
  findMany: vi.fn(),
  getConfig: vi.fn(),
  getTikTokConfig: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  refreshTikTokToken: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({
  db: { integration: { findMany, update } },
}));
vi.mock('../clients/meta-graph.js', () => ({
  checkInstagramAccountAccess: checkAccess,
  exchangeFacebookLongLivedToken: exchangeToken,
}));
vi.mock('../clients/tiktok-shop.js', () => ({
  refreshTikTokShopAccessToken: refreshTikTokToken,
}));
vi.mock('../config/runtime-config.js', () => ({
  getMetaWebhookConfig: getConfig,
  getTikTokShopApiConfig: getTikTokConfig,
}));
vi.mock('../logger.js', () => ({ default: logger }));
vi.mock('./registration.js', () => ({
  createMaintenanceQueue: vi.fn(),
  createMaintenanceWorker: vi.fn(),
  scheduleRepeatableJob: vi.fn(),
  ONE_DAY_MS: 86_400_000,
}));

import { runTokenHealthCheck } from './token-health.js';

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'integration-1',
    organizationId: 'org-1',
    externalAccountId: 'ig-1',
    accessToken: 'page-token',
    refreshToken: null,
    tokenExpiresAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

describe('runTokenHealthCheck', () => {
  beforeEach(() => {
    checkAccess.mockReset();
    exchangeToken.mockReset();
    findMany.mockReset();
    getConfig.mockReset();
    getTikTokConfig.mockReset();
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
    refreshTikTokToken.mockReset();
    update.mockReset();
    getConfig.mockReturnValue({ appId: 'app-id', appSecret: 'app-secret' });
    getTikTokConfig.mockReturnValue({ appKey: null, appSecret: null, enabled: false, refreshTokenUrl: null, refreshTokenMethod: 'POST' });
    update.mockResolvedValue({});
  });

  it('marks invalid account tokens expired', async () => {
    findMany.mockResolvedValueOnce([integration()]).mockResolvedValueOnce([]);
    checkAccess.mockResolvedValue({ error: { message: 'Invalid token' } });

    await runTokenHealthCheck();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: { tokenExpiresAt: new Date(0) },
    });
  });

  it('refreshes the user token and extends a healthy page token', async () => {
    findMany.mockResolvedValueOnce([integration({ refreshToken: 'refresh-token' })]).mockResolvedValueOnce([]);
    checkAccess.mockResolvedValue({ data: { id: 'ig-1' } });
    exchangeToken.mockResolvedValue({ data: { access_token: 'new-refresh-token' } });

    await runTokenHealthCheck();

    expect(exchangeToken).toHaveBeenCalledWith('app-id', 'app-secret', 'refresh-token');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        tokenExpiresAt: expect.any(Date),
        refreshToken: 'new-refresh-token',
      },
    });
  });

  it('continues checking other integrations after a provider failure', async () => {
    findMany.mockResolvedValueOnce([
      integration(),
      integration({ id: 'integration-2', organizationId: 'org-2', externalAccountId: 'ig-2' }),
    ]).mockResolvedValueOnce([]);
    checkAccess
      .mockRejectedValueOnce(new Error('Meta unavailable'))
      .mockResolvedValueOnce({ data: { id: 'ig-2' } });

    await runTokenHealthCheck();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', err: 'Meta unavailable' }),
      '[TokenHealth] Failed to check token',
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-2' },
      data: { tokenExpiresAt: expect.any(Date) },
    });
  });

  it('refreshes expiring TikTok Shop tokens', async () => {
    getTikTokConfig.mockReturnValue({
      appKey: 'tts-app-key',
      appSecret: 'tts-app-secret',
      enabled: true,
      refreshTokenMethod: 'POST',
      refreshTokenUrl: 'https://auth.tiktok.test/token',
    });
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'tiktok-integration-1',
          organizationId: 'org-1',
          externalAccountId: 'shop-1',
          metadata: { provider: 'tiktok_shop' },
          refreshToken: 'tts-refresh',
          tokenExpiresAt: new Date(Date.now() + 60_000),
        },
      ]);
    refreshTikTokToken.mockResolvedValue({
      accessToken: 'tts-access-new',
      refreshToken: 'tts-refresh-new',
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
    });

    await runTokenHealthCheck();

    expect(refreshTikTokToken).toHaveBeenCalledWith(expect.objectContaining({
      appKey: 'tts-app-key',
      refreshTokenUrl: 'https://auth.tiktok.test/token',
    }), 'tts-refresh');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'tiktok-integration-1' },
      data: expect.objectContaining({
        accessToken: 'tts-access-new',
        refreshToken: 'tts-refresh-new',
        tokenExpiresAt: expect.any(Date),
        metadata: expect.objectContaining({
          provider: 'tiktok_shop',
          tiktokShop: expect.objectContaining({ lastRefreshAt: expect.any(String) }),
        }),
      }),
    });
  });
});
