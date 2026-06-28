import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  checkAccess,
  exchangeToken,
  findMany,
  getConfig,
  logger,
  update,
} = vi.hoisted(() => ({
  checkAccess: vi.fn(),
  exchangeToken: vi.fn(),
  findMany: vi.fn(),
  getConfig: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  update: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({
  db: { integration: { findMany, update } },
}));
vi.mock('../clients/meta-graph.js', () => ({
  checkInstagramAccountAccess: checkAccess,
  exchangeFacebookLongLivedToken: exchangeToken,
}));
vi.mock('../config/runtime-config.js', () => ({
  getMetaWebhookConfig: getConfig,
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
    vi.clearAllMocks();
    getConfig.mockReturnValue({ appId: 'app-id', appSecret: 'app-secret' });
    update.mockResolvedValue({});
  });

  it('marks invalid account tokens expired', async () => {
    findMany.mockResolvedValue([integration()]);
    checkAccess.mockResolvedValue({ error: { message: 'Invalid token' } });

    await runTokenHealthCheck();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: { tokenExpiresAt: new Date(0) },
    });
  });

  it('refreshes the user token and extends a healthy page token', async () => {
    findMany.mockResolvedValue([integration({ refreshToken: 'refresh-token' })]);
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
    findMany.mockResolvedValue([
      integration(),
      integration({ id: 'integration-2', organizationId: 'org-2', externalAccountId: 'ig-2' }),
    ]);
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
});
