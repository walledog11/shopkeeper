import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchAccount,
  fetchSubscription,
  findMany,
  getTikTokConfig,
  logger,
  refreshInstagramToken,
  refreshTikTokToken,
  update,
} = vi.hoisted(() => ({
  fetchAccount: vi.fn(),
  fetchSubscription: vi.fn(),
  findMany: vi.fn(),
  getTikTokConfig: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  refreshInstagramToken: vi.fn(),
  refreshTikTokToken: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({
  db: { integration: { findMany, update } },
}));
vi.mock('../clients/instagram-graph.js', () => ({
  fetchConnectedInstagramAccount: fetchAccount,
  fetchInstagramMessageSubscription: fetchSubscription,
  refreshInstagramAccessToken: refreshInstagramToken,
}));
vi.mock('../clients/tiktok-shop.js', () => ({
  refreshTikTokShopAccessToken: refreshTikTokToken,
}));
vi.mock('../config/runtime-config.js', () => ({
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

const NOW = new Date('2026-07-14T12:00:00.000Z');
const DAY_MS = 86_400_000;

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'integration-1',
    organizationId: 'org-1',
    externalAccountId: 'ig-1',
    accessToken: 'instagram-token',
    createdAt: new Date(NOW.getTime() - 10 * DAY_MS),
    metadata: {
      instagram: {
        accessTokenIssuedAt: new Date(NOW.getTime() - 10 * DAY_MS).toISOString(),
        authModel: 'instagram_login',
        subscribedFields: ['messages'],
      },
    },
    refreshToken: null,
    tokenExpiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
    ...overrides,
  };
}

function instagramRows(rows: ReturnType<typeof integration>[]) {
  findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
}

function providerError(
  category: 'authentication' | 'permission' | 'rate_limit' | 'transient_provider_failure' | 'validation' | 'unknown',
  overrides: Record<string, unknown> = {},
) {
  return {
    ok: false,
    error: {
      category,
      code: category === 'authentication' ? 190 : null,
      httpStatus: category === 'transient_provider_failure' ? 503 : 400,
      message: 'Provider request failed',
      requestId: 'trace-1',
      subcode: null,
      ...overrides,
    },
  };
}

describe('runTokenHealthCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fetchAccount.mockReset();
    fetchSubscription.mockReset();
    findMany.mockReset();
    getTikTokConfig.mockReset();
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
    refreshInstagramToken.mockReset();
    refreshTikTokToken.mockReset();
    update.mockReset();
    getTikTokConfig.mockReturnValue({ appKey: null, appSecret: null, enabled: false, refreshTokenUrl: null, refreshTokenMethod: 'POST' });
    update.mockResolvedValue({});
    fetchAccount.mockResolvedValue({
      ok: true,
      data: { userId: 'ig-1', username: 'shop', accountType: 'BUSINESS' },
    });
    fetchSubscription.mockResolvedValue({
      ok: true,
      data: { fields: ['messages'], messagesActive: true },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks only Instagram Login rows and leaves a healthy far-expiry token unchanged', async () => {
    instagramRows([integration()]);

    await runTokenHealthCheck();

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        platform: 'ig_dm',
        accessToken: { not: null },
        metadata: { path: ['instagram', 'authModel'], equals: 'instagram_login' },
      },
    });
    expect(fetchAccount).toHaveBeenCalledWith('instagram-token');
    expect(fetchSubscription).toHaveBeenCalledWith('ig-1', 'instagram-token');
    expect(refreshInstagramToken).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          instagram: expect.objectContaining({
            healthStatus: 'healthy',
            lastHealthCheckAt: NOW.toISOString(),
            lastHealthError: null,
            lastSuccessfulHealthCheckAt: NOW.toISOString(),
            lastSuccessfulSubscriptionAt: NOW.toISOString(),
            lastSubscriptionCheckAt: NOW.toISOString(),
            subscribedFields: ['messages'],
          }),
        }),
        refreshToken: null,
      },
    });
  });

  it('refreshes an expiring Instagram token and saves Meta returned token and expiry', async () => {
    instagramRows([integration({ tokenExpiresAt: new Date(NOW.getTime() + 3 * DAY_MS) })]);
    refreshInstagramToken.mockResolvedValue({
      ok: true,
      data: { accessToken: 'refreshed-instagram-token', expiresIn: 5_000_000, tokenType: 'bearer' },
    });

    await runTokenHealthCheck();

    expect(refreshInstagramToken).toHaveBeenCalledWith('instagram-token');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        accessToken: 'refreshed-instagram-token',
        metadata: expect.objectContaining({
          instagram: expect.objectContaining({
            accessTokenIssuedAt: NOW.toISOString(),
            healthStatus: 'healthy',
            lastHealthError: null,
            lastRefreshAt: NOW.toISOString(),
          }),
        }),
        refreshToken: null,
        tokenExpiresAt: new Date(NOW.getTime() + 5_000_000 * 1000),
      },
    });
  });

  it('does not refresh a token until it is at least 24 hours old', async () => {
    const issuedAt = new Date(NOW.getTime() - 12 * 60 * 60 * 1000).toISOString();
    instagramRows([integration({
      createdAt: new Date(issuedAt),
      metadata: { instagram: { accessTokenIssuedAt: issuedAt, authModel: 'instagram_login' } },
      tokenExpiresAt: new Date(NOW.getTime() + 3 * DAY_MS),
    })]);

    await runTokenHealthCheck();

    expect(refreshInstagramToken).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: expect.objectContaining({ refreshToken: null }),
    });
  });

  it('marks definitive authentication failures for reconnect', async () => {
    instagramRows([integration()]);
    fetchAccount.mockResolvedValue(providerError('authentication'));

    await runTokenHealthCheck();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          instagram: expect.objectContaining({
            healthStatus: 'reconnect_required',
            lastHealthError: expect.objectContaining({ category: 'authentication', code: 190 }),
          }),
        }),
        refreshToken: null,
        tokenExpiresAt: new Date(0),
      },
    });
  });

  it('requires reconnect without expiring the token when the account identity changes', async () => {
    instagramRows([integration()]);
    fetchAccount.mockResolvedValue({
      ok: true,
      data: { userId: 'ig-other', username: 'other', accountType: 'BUSINESS' },
    });

    await runTokenHealthCheck();

    expect(fetchSubscription).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          instagram: expect.objectContaining({
            healthStatus: 'reconnect_required',
            lastHealthError: expect.objectContaining({ code: 'account_identity_mismatch' }),
          }),
        }),
        refreshToken: null,
      },
    });
  });

  it('keeps the provider expiry after a transient account-probe failure', async () => {
    instagramRows([integration()]);
    fetchAccount.mockResolvedValue(providerError('transient_provider_failure'));

    await runTokenHealthCheck();

    expect(fetchSubscription).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          instagram: expect.objectContaining({
            healthStatus: 'degraded',
            lastHealthError: expect.objectContaining({ category: 'transient_provider_failure' }),
          }),
        }),
        refreshToken: null,
      },
    });
  });

  it('requires reconnect when the messages subscription is no longer active', async () => {
    instagramRows([integration()]);
    fetchSubscription.mockResolvedValue({
      ok: true,
      data: { fields: ['comments'], messagesActive: false },
    });

    await runTokenHealthCheck();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          instagram: expect.objectContaining({
            healthStatus: 'reconnect_required',
            lastHealthError: expect.objectContaining({
              category: 'permission',
              code: 'messages_subscription_missing',
            }),
            subscribedFields: ['comments'],
          }),
        }),
        refreshToken: null,
      },
    });
    const metadata = update.mock.calls[0]?.[0]?.data.metadata as {
      instagram: Record<string, unknown>;
    };
    expect(metadata.instagram.lastSubscriptionCheckAt).toBe(NOW.toISOString());
    expect(metadata.instagram.lastSuccessfulSubscriptionAt).toBeUndefined();
  });

  it('does not expire the current token when refresh fails transiently', async () => {
    instagramRows([integration({ tokenExpiresAt: new Date(NOW.getTime() + 3 * DAY_MS) })]);
    refreshInstagramToken.mockResolvedValue(providerError('rate_limit', {
      code: 4,
      httpStatus: 429,
    }));

    await runTokenHealthCheck();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          instagram: expect.objectContaining({
            healthStatus: 'degraded',
            lastHealthError: expect.objectContaining({ category: 'rate_limit', code: 4 }),
          }),
        }),
        refreshToken: null,
      },
    });
  });

  it('marks a locally expired token without calling Instagram', async () => {
    instagramRows([integration({ tokenExpiresAt: new Date(NOW.getTime() - DAY_MS) })]);

    await runTokenHealthCheck();

    expect(fetchAccount).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          instagram: expect.objectContaining({
            healthStatus: 'reconnect_required',
            lastHealthError: expect.objectContaining({ code: 'stored_token_expired' }),
          }),
        }),
        refreshToken: null,
        tokenExpiresAt: new Date(0),
      },
    });
  });

  it('continues checking other integrations after an unexpected client failure', async () => {
    instagramRows([
      integration(),
      integration({
        id: 'integration-2',
        organizationId: 'org-2',
        externalAccountId: 'ig-2',
      }),
    ]);
    fetchAccount
      .mockRejectedValueOnce(new Error('Unexpected client failure'))
      .mockResolvedValueOnce({
        ok: true,
        data: { userId: 'ig-2', username: 'shop-2', accountType: 'BUSINESS' },
      });

    await runTokenHealthCheck();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', err: 'Unexpected client failure' }),
      '[TokenHealth] Failed to check token',
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-2' },
      data: expect.objectContaining({ refreshToken: null }),
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
