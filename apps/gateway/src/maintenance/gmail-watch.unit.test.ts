import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GmailApiError } from '@shopkeeper/email';

const { dbMock, loggerMock } = vi.hoisted(() => ({
  dbMock: {
    integration: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  loggerMock: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@shopkeeper/db', () => ({ db: dbMock }));
vi.mock('../logger.js', () => ({ default: loggerMock }));

import { runGmailWatchMaintenance } from './gmail-watch.js';

const NOW = new Date('2026-07-03T12:00:00.000Z');

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'integration-1',
    accessToken: 'access-token',
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
    externalAccountId: 'merchant@gmail.test',
    metadata: {
      provider: 'gmail',
      custom: 'preserved',
      gmail: {
        inboundStatus: 'active',
        historyId: '500',
        lastSyncedAt: '2026-07-03T11:00:00.000Z',
        watchExpiration: String(NOW.getTime() + 60 * 60 * 1_000),
      },
    },
    organizationId: 'organization-1',
    refreshToken: 'refresh-token',
    tokenExpiresAt: new Date('2026-07-03T13:00:00.000Z'),
    ...overrides,
  };
}

function redis() {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    eval: vi.fn().mockResolvedValue(1),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('EMAIL_INBOUND_MODE', 'hybrid');
  dbMock.integration.update.mockResolvedValue({});
});

describe('runGmailWatchMaintenance', () => {
  it('renews an expiring watch without replacing its sync checkpoint', async () => {
    const row = integration();
    dbMock.integration.findMany.mockResolvedValue([row]);
    dbMock.integration.findUnique.mockResolvedValue(row);
    const client = {
      watch: vi.fn().mockResolvedValue({
        historyId: '900',
        expiration: String(NOW.getTime() + 7 * 24 * 60 * 60 * 1_000),
      }),
    };

    const result = await runGmailWatchMaintenance({
      redis: redis(),
      createClient: () => client as never,
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result).toMatchObject({ checked: 1, renewed: 1, failed: 0 });
    expect(client.watch).toHaveBeenCalledWith({
      topicName: 'projects/test/topics/gmail-inbound',
      labelIds: ['INBOX'],
      labelFilterBehavior: 'include',
    });
    expect(dbMock.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          custom: 'preserved',
          gmail: expect.objectContaining({
            historyId: '500',
            inboundStatus: 'active',
            watchFailureCount: 0,
            watchLastRenewedAt: NOW.toISOString(),
          }),
        }),
      },
    });
  });

  it('marks revoked grants for reconnection and alerts after repeated failures', async () => {
    const row = integration({
      metadata: {
        provider: 'gmail',
        gmail: {
          inboundStatus: 'degraded',
          historyId: '500',
          watchFailureCount: 2,
        },
      },
    });
    dbMock.integration.findMany.mockResolvedValue([row]);
    dbMock.integration.findUnique.mockResolvedValue(row);
    const authError = new GmailApiError('revoked', {
      kind: 'authentication',
      status: 401,
      operation: 'users.watch',
    });
    const emitAlert = vi.fn();

    const result = await runGmailWatchMaintenance({
      redis: redis(),
      createClient: () => ({ watch: vi.fn().mockRejectedValue(authError) }) as never,
      emitAlert,
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result).toMatchObject({ checked: 1, renewed: 0, failed: 1, alerts: 1 });
    expect(dbMock.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          gmail: expect.objectContaining({
            inboundStatus: 'reauthorization_required',
            lastError: 'watch_authentication',
            watchFailureCount: 3,
          }),
        }),
        tokenExpiresAt: new Date(0),
      },
    });
    expect(emitAlert).toHaveBeenCalledWith(expect.objectContaining({
      category: 'gmail_inbound',
      message: 'Gmail inbound watch renewal is repeatedly failing',
    }));
  });

  it('warns when an active integration has not synced successfully for two hours', async () => {
    const row = integration({
      metadata: {
        provider: 'gmail',
        gmail: {
          inboundStatus: 'active',
          historyId: '500',
          lastSyncedAt: '2026-07-03T09:00:00.000Z',
          watchExpiration: String(NOW.getTime() + 3 * 24 * 60 * 60 * 1_000),
        },
      },
    });
    dbMock.integration.findMany.mockResolvedValue([row]);

    const result = await runGmailWatchMaintenance({
      redis: redis(),
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result).toMatchObject({
      checked: 1,
      renewed: 0,
      staleSyncWarnings: 1,
    });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        lastSyncedAt: '2026-07-03T09:00:00.000Z',
      }),
      '[Gmail Watch] Active integration has no recent successful sync',
    );
  });

  it('skips renewal while the sync worker owns the integration lock', async () => {
    const row = integration();
    dbMock.integration.findMany.mockResolvedValue([row]);
    const lockedRedis = redis();
    lockedRedis.set.mockResolvedValueOnce(null);

    const result = await runGmailWatchMaintenance({
      redis: lockedRedis,
      createClient: vi.fn(),
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result).toMatchObject({ skippedForLock: 1, renewed: 0, failed: 0 });
    expect(dbMock.integration.findUnique).not.toHaveBeenCalled();
  });
});
