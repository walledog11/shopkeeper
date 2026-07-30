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
        watchLastRenewedAt: '2026-07-03T11:00:00.000Z',
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

function syncQueue() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'gmail-maintenance-sync' }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('EMAIL_INBOUND_MODE', 'hybrid');
  vi.stubEnv('GMAIL_NATIVE_INBOUND', 'true');
  dbMock.integration.update.mockResolvedValue({});
});

describe('runGmailWatchMaintenance', () => {
  it('honors global native-inbound and runtime-mode disablement', async () => {
    const row = integration();
    dbMock.integration.findMany.mockResolvedValue([row]);
    const queue = syncQueue();

    vi.stubEnv('GMAIL_NATIVE_INBOUND', 'false');
    const disabled = await runGmailWatchMaintenance({
      redis: redis(),
      syncQueue: queue,
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    vi.stubEnv('GMAIL_NATIVE_INBOUND', 'true');
    vi.stubEnv('EMAIL_INBOUND_MODE', 'postmark');
    const postmarkOnly = await runGmailWatchMaintenance({
      redis: redis(),
      syncQueue: queue,
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(disabled.checked).toBe(0);
    expect(postmarkOnly.checked).toBe(0);
  });

  it('filters non-Gmail, Postmark-only, and reconnect-required rows before maintenance', async () => {
    dbMock.integration.findMany.mockResolvedValue([
      integration({ metadata: null }),
      integration({ metadata: { provider: 'postmark' } }),
      integration({
        metadata: {
          provider: 'gmail',
          inboundMode: 'postmark',
          gmail: { inboundStatus: 'active', historyId: '500' },
        },
      }),
      integration({
        metadata: {
          provider: 'gmail',
          gmail: { inboundStatus: 'reauthorization_required', historyId: '500' },
        },
      }),
    ]);
    const queue = syncQueue();

    const result = await runGmailWatchMaintenance({
      redis: redis(),
      syncQueue: queue,
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result.checked).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not enroll an existing send-only Gmail connection into native inbound', async () => {
    dbMock.integration.findMany.mockResolvedValue([
      integration({
        metadata: {
          provider: 'gmail',
          oauthScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        },
      }),
    ]);
    const createClient = vi.fn();

    const result = await runGmailWatchMaintenance({
      redis: redis(),
      syncQueue: syncQueue(),
      createClient,
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result).toMatchObject({ checked: 0, renewed: 0, failed: 0 });
    expect(createClient).not.toHaveBeenCalled();
  });

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
      syncQueue: syncQueue(),
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

  it('renews a healthy watch daily even when expiration is not near', async () => {
    const row = integration({
      metadata: {
        provider: 'gmail',
        gmail: {
          inboundStatus: 'active',
          historyId: '500',
          lastSyncedAt: '2026-07-03T11:00:00.000Z',
          watchLastRenewedAt: '2026-07-02T10:00:00.000Z',
          watchExpiration: String(NOW.getTime() + 5 * 24 * 60 * 60 * 1_000),
        },
      },
    });
    dbMock.integration.findMany.mockResolvedValue([row]);
    dbMock.integration.findUnique.mockResolvedValue(row);
    const watch = vi.fn().mockResolvedValue({
      historyId: '900',
      expiration: String(NOW.getTime() + 7 * 24 * 60 * 60 * 1_000),
    });

    const result = await runGmailWatchMaintenance({
      redis: redis(),
      syncQueue: syncQueue(),
      createClient: () => ({ watch }) as never,
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result).toMatchObject({ renewed: 1, catchupsEnqueued: 1 });
    expect(watch).toHaveBeenCalledOnce();
  });

  it('keeps an incomplete recovery degraded when its watch renews', async () => {
    const row = integration({
      metadata: {
        provider: 'gmail',
        gmail: {
          inboundStatus: 'degraded',
          historyId: '500',
          lastError: 'sync_recovery_truncated',
          watchLastRenewedAt: '2026-07-02T10:00:00.000Z',
          watchExpiration: String(NOW.getTime() + 5 * 24 * 60 * 60 * 1_000),
        },
      },
    });
    dbMock.integration.findMany.mockResolvedValue([row]);
    dbMock.integration.findUnique.mockResolvedValue(row);

    const result = await runGmailWatchMaintenance({
      redis: redis(),
      syncQueue: syncQueue(),
      createClient: () => ({
        watch: vi.fn().mockResolvedValue({
          historyId: '900',
          expiration: String(NOW.getTime() + 7 * 24 * 60 * 60 * 1_000),
        }),
      }) as never,
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result).toMatchObject({ renewed: 1, catchupsEnqueued: 0 });
    expect(dbMock.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          gmail: expect.objectContaining({
            inboundStatus: 'degraded',
            lastError: 'sync_recovery_truncated',
            watchLastRenewedAt: NOW.toISOString(),
          }),
        }),
      },
    });
  });

  it('records a missing Pub/Sub topic as a watch configuration failure', async () => {
    const row = integration();
    dbMock.integration.findMany.mockResolvedValue([row]);
    dbMock.integration.findUnique.mockResolvedValue(row);

    const result = await runGmailWatchMaintenance({
      redis: redis(),
      syncQueue: syncQueue(),
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: null,
    });

    expect(result).toMatchObject({ renewed: 0, failed: 1, catchupsEnqueued: 0 });
    expect(dbMock.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          gmail: expect.objectContaining({
            inboundStatus: 'degraded',
            lastError: 'watch_configuration',
          }),
        }),
      },
    });
  });

  it('uses a freshly reloaded watch state and skips a redundant renewal', async () => {
    const candidate = integration();
    const fresh = integration({
      metadata: {
        provider: 'gmail',
        gmail: {
          inboundStatus: 'active',
          historyId: '500',
          watchLastRenewedAt: NOW.toISOString(),
          watchExpiration: String(NOW.getTime() + 5 * 24 * 60 * 60 * 1_000),
        },
      },
    });
    dbMock.integration.findMany.mockResolvedValue([candidate]);
    dbMock.integration.findUnique.mockResolvedValue(fresh);
    const createClient = vi.fn();

    const result = await runGmailWatchMaintenance({
      redis: redis(),
      syncQueue: syncQueue(),
      createClient,
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result).toMatchObject({ renewed: 0, catchupsEnqueued: 1 });
    expect(createClient).not.toHaveBeenCalled();
    expect(dbMock.integration.update).not.toHaveBeenCalled();
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
      syncQueue: syncQueue(),
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

  it('enqueues a stable maintenance catch-up instead of warning for an idle mailbox', async () => {
    const row = integration({
      metadata: {
        provider: 'gmail',
        gmail: {
          inboundStatus: 'active',
          historyId: '500',
          lastSyncedAt: '2026-07-03T09:00:00.000Z',
          watchLastRenewedAt: '2026-07-03T11:00:00.000Z',
          watchExpiration: String(NOW.getTime() + 3 * 24 * 60 * 60 * 1_000),
        },
      },
    });
    dbMock.integration.findMany.mockResolvedValue([row]);
    const queue = syncQueue();

    const result = await runGmailWatchMaintenance({
      redis: redis(),
      syncQueue: queue,
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result).toMatchObject({
      checked: 1,
      renewed: 0,
      catchupsEnqueued: 1,
    });
    expect(queue.add).toHaveBeenCalledWith(
      'sync-gmail-mailbox',
      expect.objectContaining({
        integrationId: 'integration-1',
        source: 'maintenance',
        traceId: expect.any(String),
      }),
      {
        jobId: `gmail-sync-maintenance-integration-1-${Math.floor(
          NOW.getTime() / (12 * 60 * 60 * 1_000),
        )}`,
      },
    );
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it('skips renewal while the sync worker owns the integration lock', async () => {
    const row = integration();
    dbMock.integration.findMany.mockResolvedValue([row]);
    const lockedRedis = redis();
    lockedRedis.set.mockResolvedValueOnce(null);

    const result = await runGmailWatchMaintenance({
      redis: lockedRedis,
      syncQueue: syncQueue(),
      createClient: vi.fn(),
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result).toMatchObject({ skippedForLock: 1, renewed: 0, failed: 0 });
    expect(dbMock.integration.findUnique).not.toHaveBeenCalled();
  });

  it('does not overwrite sync metadata after losing the renewal lease', async () => {
    const row = integration();
    dbMock.integration.findMany.mockResolvedValue([row]);
    dbMock.integration.findUnique.mockResolvedValue(row);
    const lostRedis = redis();
    lostRedis.eval.mockResolvedValueOnce(0);
    const client = {
      watch: vi.fn().mockResolvedValue({
        historyId: '900',
        expiration: String(NOW.getTime() + 7 * 24 * 60 * 60 * 1_000),
      }),
    };

    await expect(runGmailWatchMaintenance({
      redis: lostRedis,
      syncQueue: syncQueue(),
      createClient: () => client as never,
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    })).rejects.toThrow('sync lock was lost');

    expect(dbMock.integration.update).not.toHaveBeenCalled();
  });

  it('alerts on an expired watch even when renewal is skipped for an active sync', async () => {
    const row = integration({
      metadata: {
        provider: 'gmail',
        gmail: {
          inboundStatus: 'active',
          historyId: '500',
          watchLastRenewedAt: '2026-07-02T11:00:00.000Z',
          watchExpiration: String(NOW.getTime() - 1),
        },
      },
    });
    dbMock.integration.findMany.mockResolvedValue([row]);
    const lockedRedis = redis();
    lockedRedis.set.mockResolvedValueOnce(null);
    const emitAlert = vi.fn();

    const result = await runGmailWatchMaintenance({
      redis: lockedRedis,
      syncQueue: syncQueue(),
      createClient: vi.fn(),
      emitAlert,
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    });

    expect(result).toMatchObject({ skippedForLock: 1, alerts: 1 });
    expect(emitAlert).toHaveBeenCalledWith(expect.objectContaining({
      category: 'gmail_inbound',
      message: 'A Gmail inbound watch is expired',
    }));
  });

  it('surfaces unexpected lock acquisition failures to the repeatable job', async () => {
    dbMock.integration.findMany.mockResolvedValue([integration()]);
    const failedRedis = redis();
    failedRedis.set.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(runGmailWatchMaintenance({
      redis: failedRedis,
      syncQueue: syncQueue(),
      emitAlert: vi.fn(),
      now: () => NOW,
      topicName: 'projects/test/topics/gmail-inbound',
    })).rejects.toThrow('Redis unavailable');
  });
});
