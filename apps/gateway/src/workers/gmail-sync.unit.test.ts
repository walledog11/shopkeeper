import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GmailApiError, type GmailRawMessage } from '@shopkeeper/email';
import type { GmailSyncJobData, InboundJobData } from '../types.js';

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    integration: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@shopkeeper/db', () => ({ db: dbMock, INTEGRATION_REAUTH_SENTINEL: new Date(0) }));
vi.mock('../logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  GmailSyncLockUnavailableError,
} from '../lib/gmail-sync-lock.js';
import {
  calculateGmailSyncBackoff,
  processGmailSyncJob,
} from './gmail-sync.js';

const JOB_DATA: GmailSyncJobData = {
  integrationId: 'integration-1',
  notifiedHistoryId: '200',
  traceId: 'trace-1',
};

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'integration-1',
    accessToken: 'access-token',
    externalAccountId: 'owner@merchant.test',
    fromEmail: 'support@merchant.test',
    metadata: {
      provider: 'gmail',
      custom: 'preserved',
      gmail: {
        inboundStatus: 'active',
        historyId: '100',
        watchExpiration: '9999999999999',
      },
    },
    organizationId: 'organization-1',
    refreshToken: 'refresh-token',
    tokenExpiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function rawMessage(
  id: string,
  lines: string[],
  labelIds = ['INBOX'],
): GmailRawMessage {
  return {
    id,
    internalDate: '1783963200000',
    labelIds,
    raw: Buffer.from(lines.join('\r\n')),
  };
}

function message(
  id: string,
  {
    from = 'customer@example.test',
    to = 'support@merchant.test',
    extraHeaders = [],
    messageId = `<${id}@example.test>`,
    body = 'Where is my order?',
  }: {
    from?: string;
    to?: string;
    extraHeaders?: string[];
    messageId?: string | null;
    body?: string;
  } = {},
  labelIds = ['INBOX'],
): GmailRawMessage {
  return rawMessage(id, [
    `From: ${from}`,
    `To: ${to}`,
    'Subject: Order question',
    ...(messageId ? [`Message-ID: ${messageId}`] : []),
    ...extraHeaders,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ], labelIds);
}

function dependencies(client: {
  listHistory: ReturnType<typeof vi.fn>;
  getMessageRaw: ReturnType<typeof vi.fn>;
}) {
  const inboundQueue = {
    add: vi.fn().mockResolvedValue({ id: 'inbound-job' }),
  };
  const redis = {
    set: vi.fn().mockResolvedValue('OK'),
    eval: vi.fn().mockResolvedValue(1),
  };
  return {
    dependencies: {
      inboundQueue: inboundQueue as never,
      redis,
      createClient: () => client as never,
      now: () => new Date('2026-07-03T12:00:00.000Z'),
    },
    inboundQueue,
    redis,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('EMAIL_INBOUND_MODE', 'hybrid');
  vi.stubEnv('GMAIL_NATIVE_INBOUND', 'true');
  dbMock.integration.findUnique.mockResolvedValue(integration());
  dbMock.integration.update.mockResolvedValue(integration());
});

describe('processGmailSyncJob', () => {
  it('drops a job whose integration was removed before processing', async () => {
    dbMock.integration.findUnique.mockResolvedValueOnce(null);
    const client = {
      listHistory: vi.fn(),
      getMessageRaw: vi.fn(),
    };
    const { dependencies: deps } = dependencies(client);

    await processGmailSyncJob(JOB_DATA, deps);

    expect(client.listHistory).not.toHaveBeenCalled();
  });

  it('honors the native inbound kill switch before calling Gmail', async () => {
    vi.stubEnv('GMAIL_NATIVE_INBOUND', 'false');
    const client = {
      listHistory: vi.fn(),
      getMessageRaw: vi.fn(),
    };
    const { dependencies: deps } = dependencies(client);

    await processGmailSyncJob(JOB_DATA, deps);

    expect(client.listHistory).not.toHaveBeenCalled();
  });

  it.each([
    ['Postmark-only runtime mode', integration(), { EMAIL_INBOUND_MODE: 'postmark' }],
    ['authoritative Postmark provider', integration({ emailProvider: 'postmark' }), {}],
    ['integration-level Postmark mode', integration({
      metadata: {
        provider: 'gmail',
        inboundMode: 'postmark',
        gmail: { inboundStatus: 'active', historyId: '100' },
      },
    }), {}],
    ['pending native status', integration({
      metadata: {
        provider: 'gmail',
        gmail: { inboundStatus: 'pending', historyId: '100' },
      },
    }), {}],
    ['missing refresh token', integration({ refreshToken: null }), {}],
    ['missing history checkpoint', integration({
      metadata: {
        provider: 'gmail',
        gmail: { inboundStatus: 'active' },
      },
    }), {}],
  ])('skips an ineligible integration: %s', async (_label, row, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    dbMock.integration.findUnique.mockResolvedValue(row);
    const client = {
      listHistory: vi.fn(),
      getMessageRaw: vi.fn(),
    };
    const { dependencies: deps } = dependencies(client);

    await processGmailSyncJob(JOB_DATA, deps);

    expect(client.listHistory).not.toHaveBeenCalled();
  });

  it('runs a maintenance catch-up without a notification history id', async () => {
    const client = {
      listHistory: vi.fn().mockResolvedValue({
        history: [],
        historyId: '101',
      }),
      getMessageRaw: vi.fn(),
    };
    const { dependencies: deps } = dependencies(client);

    await processGmailSyncJob({
      integrationId: 'integration-1',
      source: 'maintenance',
      traceId: 'maintenance-trace',
    }, deps);

    expect(client.listHistory).toHaveBeenCalledWith({
      startHistoryId: '100',
      historyTypes: ['messageAdded'],
    });
  });

  it('does not advance when the integration is deleted during synchronization', async () => {
    dbMock.integration.findUnique
      .mockResolvedValueOnce(integration())
      .mockResolvedValueOnce(null);
    const client = {
      listHistory: vi.fn().mockResolvedValue({
        history: [{ id: '101' }],
        historyId: '101',
      }),
      getMessageRaw: vi.fn(),
    };
    const { dependencies: deps } = dependencies(client);

    await processGmailSyncJob({
      integrationId: 'integration-1',
      source: 'maintenance',
      traceId: 'maintenance-trace',
    }, deps);

    expect(dbMock.integration.update).not.toHaveBeenCalled();
  });

  it('deduplicates history, filters mailbox noise, and durably queues normalized email', async () => {
    const messages = new Map([
      ['accepted', message('accepted')],
      ['sent', message('sent', {}, ['INBOX', 'SENT'])],
      ['not-inbox', message('not-inbox', {}, ['CATEGORY_UPDATES'])],
      ['self', message('self', { from: 'OWNER@merchant.test' })],
      ['wrong-alias', message('wrong-alias', { to: 'other@merchant.test' })],
      ['alias', message('alias', {
        to: 'owner@merchant.test',
        extraHeaders: ['Delivered-To: support@merchant.test'],
        messageId: null,
      })],
    ]);
    const client = {
      listHistory: vi.fn().mockResolvedValue({
        history: [
          {
            id: '150',
            messagesAdded: [
              { message: { id: 'accepted' } },
              { message: { id: 'sent' } },
              { message: { id: 'not-inbox' } },
            ],
          },
          {
            id: '200',
            messagesAdded: [
              { message: { id: 'accepted' } },
              { message: { id: 'self' } },
              { message: { id: 'wrong-alias' } },
              { message: { id: 'alias' } },
            ],
          },
        ],
        historyId: '250',
      }),
      getMessageRaw: vi.fn((id: string) => Promise.resolve(messages.get(id))),
    };
    const { dependencies: deps, inboundQueue, redis } = dependencies(client);

    await processGmailSyncJob(JOB_DATA, deps);

    expect(client.listHistory).toHaveBeenCalledWith({
      startHistoryId: '100',
      historyTypes: ['messageAdded'],
    });
    expect(client.getMessageRaw).toHaveBeenCalledTimes(6);
    expect(inboundQueue.add).toHaveBeenCalledTimes(2);
    expect(inboundQueue.add).toHaveBeenNthCalledWith(
      1,
      'process-email',
      expect.objectContaining({
        platform: 'email',
        organizationId: 'organization-1',
        integrationId: 'integration-1',
        receivedAt: '2026-07-13T17:20:00.000Z',
        senderEmail: 'customer@example.test',
        inboundMessageId: '<accepted@example.test>',
        traceId: 'trace-1',
      } satisfies Partial<InboundJobData>),
      { jobId: 'gmail-inbound-integration-1-accepted' },
    );
    expect(inboundQueue.add).toHaveBeenNthCalledWith(
      2,
      'process-email',
      expect.objectContaining({
        inboundMessageId: 'gmail:alias',
      }),
      { jobId: 'gmail-inbound-integration-1-alias' },
    );
    expect(dbMock.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          provider: 'gmail',
          custom: 'preserved',
          gmail: expect.objectContaining({
            historyId: '250',
            inboundStatus: 'active',
            lastSyncedAt: '2026-07-03T12:00:00.000Z',
            watchExpiration: '9999999999999',
          }),
        }),
      },
    });
    expect(redis.set).toHaveBeenCalledWith(
      'gmail-sync:lock:integration-1',
      expect.any(String),
      'PX',
      900_000,
      'NX',
    );
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get"'),
      1,
      'gmail-sync:lock:integration-1',
      redis.set.mock.calls[0][1],
    );
  });

  it('does not advance the checkpoint when durable inbound enqueueing fails', async () => {
    const client = {
      listHistory: vi.fn().mockResolvedValue({
        history: [{ id: '200', messagesAdded: [{ message: { id: 'accepted' } }] }],
        historyId: '250',
      }),
      getMessageRaw: vi.fn().mockResolvedValue(message('accepted')),
    };
    const { dependencies: deps, inboundQueue, redis } = dependencies(client);
    inboundQueue.add.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(processGmailSyncJob(JOB_DATA, deps)).rejects.toThrow('Redis unavailable');

    expect(dbMock.integration.update).not.toHaveBeenCalled();
    expect(redis.eval).toHaveBeenCalledTimes(1);
  });

  it('drops over-budget Gmail attachments before placing the message in Redis', async () => {
    vi.stubEnv('GATEWAY_ATTACHMENT_MAX_BYTES', '4');
    const client = {
      listHistory: vi.fn().mockResolvedValue({
        history: [{ id: '200', messagesAdded: [{ message: { id: 'attachment' } }] }],
        historyId: '250',
      }),
      getMessageRaw: vi.fn().mockResolvedValue(rawMessage('attachment', [
        'From: customer@example.test',
        'To: support@merchant.test',
        'Subject: Attachment',
        'Message-ID: <attachment@example.test>',
        'Content-Type: multipart/mixed; boundary="boundary"',
        '',
        '--boundary',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        'Please see the file.',
        '--boundary',
        'Content-Type: text/plain',
        'Content-Disposition: attachment; filename="note.txt"',
        'Content-Transfer-Encoding: base64',
        '',
        'aGVsbG8=',
        '--boundary--',
      ])),
    };
    const { dependencies: deps, inboundQueue } = dependencies(client);

    await processGmailSyncJob(JOB_DATA, deps);

    const queuedData = inboundQueue.add.mock.calls[0]?.[1] as InboundJobData;
    expect(queuedData.body).toBe('Please see the file.');
    expect(queuedData.attachments).toBeUndefined();
  });

  it('marks an integration for reconnection after Gmail authentication fails', async () => {
    const authError = new GmailApiError('refresh rejected', {
      kind: 'authentication',
      status: 401,
      operation: 'users.history.list',
    });
    const client = {
      listHistory: vi.fn().mockRejectedValue(authError),
      getMessageRaw: vi.fn(),
    };
    const { dependencies: deps } = dependencies(client);

    await expect(processGmailSyncJob(JOB_DATA, deps)).rejects.toBe(authError);

    expect(dbMock.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        tokenExpiresAt: new Date(0),
        metadata: expect.objectContaining({
          custom: 'preserved',
          gmail: expect.objectContaining({
            inboundStatus: 'reauthorization_required',
            lastError: 'sync_authentication',
          }),
        }),
      },
    });
  });

  it('does not write reconnect state after an integration is deleted during an auth failure', async () => {
    dbMock.integration.findUnique
      .mockResolvedValueOnce(integration())
      .mockResolvedValueOnce(null);
    const authError = new GmailApiError('refresh rejected', {
      kind: 'authentication',
      status: 401,
      operation: 'users.history.list',
    });
    const client = {
      listHistory: vi.fn().mockRejectedValue(authError),
      getMessageRaw: vi.fn(),
    };
    const { dependencies: deps } = dependencies(client);

    await expect(processGmailSyncJob(JOB_DATA, deps)).rejects.toBe(authError);

    expect(dbMock.integration.update).not.toHaveBeenCalled();
  });

  it('recovers a bounded inbox window and establishes a fresh watch for stale history', async () => {
    vi.stubEnv('GMAIL_PUBSUB_TOPIC', 'projects/test/topics/gmail-inbound');
    const staleError = new GmailApiError('history expired', {
      kind: 'stale_history',
      status: 404,
      operation: 'users.history.list',
    });
    const client = {
      listHistory: vi.fn().mockRejectedValue(staleError),
      listMessages: vi.fn()
        .mockResolvedValueOnce({ messages: [{ id: 'recovered' }] })
        .mockResolvedValueOnce({
          messages: [{ id: 'arrived-during-recovery' }, { id: 'recovered' }],
        }),
      getMessageRaw: vi.fn((id: string) => Promise.resolve(message(id))),
      watch: vi.fn().mockResolvedValue({
        historyId: '900',
        expiration: '1783382400000',
      }),
    };
    const { dependencies: deps, inboundQueue } = dependencies(client);

    await processGmailSyncJob(JOB_DATA, deps);

    expect(client.listMessages).toHaveBeenCalledWith({
      maxResults: 500,
      query: 'newer_than:7d in:inbox',
      labelIds: ['INBOX'],
      includeSpamTrash: false,
    });
    expect(inboundQueue.add).toHaveBeenCalledWith(
      'process-email',
      expect.objectContaining({ inboundMessageId: '<recovered@example.test>' }),
      { jobId: 'gmail-inbound-integration-1-recovered' },
    );
    expect(inboundQueue.add).toHaveBeenCalledWith(
      'process-email',
      expect.objectContaining({
        inboundMessageId: '<arrived-during-recovery@example.test>',
      }),
      { jobId: 'gmail-inbound-integration-1-arrived-during-recovery' },
    );
    expect(client.listMessages).toHaveBeenCalledTimes(2);
    expect(client.watch).toHaveBeenCalledWith({
      topicName: 'projects/test/topics/gmail-inbound',
      labelIds: ['INBOX'],
      labelFilterBehavior: 'include',
    });
    expect(dbMock.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          gmail: expect.objectContaining({
            historyId: '900',
            inboundStatus: 'active',
            lastSyncedAt: '2026-07-03T12:00:00.000Z',
            watchExpiration: '1783382400000',
            watchFailureCount: 0,
          }),
        }),
      },
    });
  });

  it('does not establish a recovery checkpoint until recovered messages are queued', async () => {
    vi.stubEnv('GMAIL_PUBSUB_TOPIC', 'projects/test/topics/gmail-inbound');
    const client = {
      listHistory: vi.fn().mockRejectedValue(new GmailApiError('history expired', {
        kind: 'stale_history',
        status: 404,
        operation: 'users.history.list',
      })),
      listMessages: vi.fn().mockResolvedValue({
        messages: [{ id: 'recovered' }],
      }),
      getMessageRaw: vi.fn().mockResolvedValue(message('recovered')),
      watch: vi.fn(),
    };
    const { dependencies: deps, inboundQueue } = dependencies(client);
    inboundQueue.add.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(processGmailSyncJob(JOB_DATA, deps)).rejects.toThrow('Redis unavailable');

    expect(client.watch).not.toHaveBeenCalled();
    expect(dbMock.integration.update).not.toHaveBeenCalled();
  });

  it('marks bounded stale-history recovery degraded instead of silently skipping another page', async () => {
    vi.stubEnv('GMAIL_PUBSUB_TOPIC', 'projects/test/topics/gmail-inbound');
    const client = {
      listHistory: vi.fn().mockRejectedValue(new GmailApiError('history expired', {
        kind: 'stale_history',
        status: 404,
        operation: 'users.history.list',
      })),
      listMessages: vi.fn().mockResolvedValue({
        messages: [{ id: 'recovered-1' }, { id: 'recovered-2' }],
        nextPageToken: 'more-results',
      }),
      getMessageRaw: vi.fn((id: string) => Promise.resolve(message(id))),
      watch: vi.fn(),
    };
    const emitAlert = vi.fn();
    const { dependencies: deps, inboundQueue } = dependencies(client);

    await processGmailSyncJob(JOB_DATA, {
      ...deps,
      emitAlert,
      recoveryMaxMessages: 2,
    });

    expect(inboundQueue.add).toHaveBeenCalledTimes(2);
    expect(client.watch).not.toHaveBeenCalled();
    expect(dbMock.integration.update).toHaveBeenLastCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          gmail: expect.objectContaining({
            inboundStatus: 'degraded',
            lastError: 'sync_recovery_truncated',
          }),
        }),
      },
    });
    expect(emitAlert).toHaveBeenCalledWith(expect.objectContaining({
      category: 'gmail_inbound',
      message: 'Gmail stale-history recovery exceeded its safe message bound',
    }));
  });

  it('marks recovery degraded when the post-watch race-closing list is truncated', async () => {
    vi.stubEnv('GMAIL_PUBSUB_TOPIC', 'projects/test/topics/gmail-inbound');
    const client = {
      listHistory: vi.fn().mockRejectedValue(new GmailApiError('history expired', {
        kind: 'stale_history',
        status: 404,
        operation: 'users.history.list',
      })),
      listMessages: vi.fn()
        .mockResolvedValueOnce({ messages: [{ id: 'recovered-1' }] })
        .mockResolvedValueOnce({
          messages: [{ id: 'recovered-1' }, { id: 'new-during-watch' }],
          nextPageToken: 'more-results',
        }),
      getMessageRaw: vi.fn((id: string) => Promise.resolve(message(id))),
      watch: vi.fn().mockResolvedValue({
        historyId: '900',
        expiration: '1783382400000',
      }),
    };
    const emitAlert = vi.fn();
    const { dependencies: deps } = dependencies(client);

    await processGmailSyncJob(JOB_DATA, {
      ...deps,
      emitAlert,
      recoveryMaxMessages: 2,
    });

    expect(client.watch).toHaveBeenCalledOnce();
    expect(emitAlert).toHaveBeenCalledOnce();
    expect(dbMock.integration.update).toHaveBeenLastCalledWith({
      where: { id: 'integration-1' },
      data: {
        metadata: expect.objectContaining({
          gmail: expect.objectContaining({
            inboundStatus: 'degraded',
            lastError: 'sync_recovery_truncated',
          }),
        }),
      },
    });
  });

  it('paginates stale-history recovery within its bound', async () => {
    vi.stubEnv('GMAIL_PUBSUB_TOPIC', 'projects/test/topics/gmail-inbound');
    const client = {
      listHistory: vi.fn().mockRejectedValue(new GmailApiError('history expired', {
        kind: 'stale_history',
        status: 404,
        operation: 'users.history.list',
      })),
      listMessages: vi.fn()
        .mockResolvedValueOnce({
          messages: [{ id: 'recovered-1' }],
          nextPageToken: 'page-2',
        })
        .mockResolvedValueOnce({
          messages: [{ id: 'recovered-2' }],
        })
        .mockResolvedValueOnce({
          messages: [{ id: 'recovered-1' }, { id: 'recovered-2' }],
        }),
      getMessageRaw: vi.fn((id: string) => Promise.resolve(message(id))),
      watch: vi.fn().mockResolvedValue({
        historyId: '900',
        expiration: '1783382400000',
      }),
    };
    const { dependencies: deps } = dependencies(client);

    await processGmailSyncJob(JOB_DATA, {
      ...deps,
      recoveryMaxMessages: 3,
    });

    expect(client.listMessages).toHaveBeenNthCalledWith(2, {
      maxResults: 2,
      pageToken: 'page-2',
      query: 'newer_than:7d in:inbox',
      labelIds: ['INBOX'],
      includeSpamTrash: false,
    });
    expect(client.watch).toHaveBeenCalledOnce();
  });

  it('allows a bounded operator recovery only for the truncated degraded state', async () => {
    vi.stubEnv('GMAIL_PUBSUB_TOPIC', 'projects/test/topics/gmail-inbound');
    dbMock.integration.findUnique.mockResolvedValue(integration({
      metadata: {
        provider: 'gmail',
        gmail: {
          inboundStatus: 'degraded',
          historyId: '100',
          lastError: 'sync_recovery_truncated',
        },
      },
    }));
    const client = {
      listHistory: vi.fn().mockRejectedValue(new GmailApiError('history expired', {
        kind: 'stale_history',
        status: 404,
        operation: 'users.history.list',
      })),
      listMessages: vi.fn().mockResolvedValue({ messages: [] }),
      getMessageRaw: vi.fn(),
      watch: vi.fn().mockResolvedValue({
        historyId: '900',
        expiration: '1783382400000',
      }),
    };
    const { dependencies: deps } = dependencies(client);

    await processGmailSyncJob({
      integrationId: 'integration-1',
      source: 'operator_recovery',
      recoveryMaxMessages: 5_000,
      recoveryQuery: 'newer_than:30d in:inbox',
      traceId: 'operator-recovery-trace',
    }, deps);

    expect(client.listMessages).toHaveBeenCalledWith({
      maxResults: 500,
      query: 'newer_than:30d in:inbox',
      labelIds: ['INBOX'],
      includeSpamTrash: false,
    });
    expect(client.watch).toHaveBeenCalledOnce();
  });

  it('rejects an unsafe operator recovery bound before calling Gmail history', async () => {
    const client = {
      listHistory: vi.fn(),
      getMessageRaw: vi.fn(),
    };
    const { dependencies: deps } = dependencies(client);

    await expect(processGmailSyncJob({
      integrationId: 'integration-1',
      source: 'operator_recovery',
      recoveryMaxMessages: 50_001,
      traceId: 'operator-recovery-trace',
    }, deps)).rejects.toThrow('recoveryMaxMessages must be between 1 and 50000');

    expect(client.listHistory).not.toHaveBeenCalled();
  });

  it('retries lock contention instead of dropping the notification', async () => {
    const client = {
      listHistory: vi.fn(),
      getMessageRaw: vi.fn(),
    };
    const { dependencies: deps, redis } = dependencies(client);
    redis.set.mockResolvedValueOnce(null);

    await expect(processGmailSyncJob(JOB_DATA, deps)).rejects.toBeInstanceOf(
      GmailSyncLockUnavailableError,
    );

    expect(dbMock.integration.findUnique).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('does not regress the checkpoint for an out-of-order notification', async () => {
    dbMock.integration.findUnique.mockResolvedValue(
      integration({
        metadata: {
          provider: 'gmail',
          gmail: { inboundStatus: 'active', historyId: '300' },
        },
      }),
    );
    const client = {
      listHistory: vi.fn(),
      getMessageRaw: vi.fn(),
    };
    const { dependencies: deps } = dependencies(client);

    await processGmailSyncJob(
      { ...JOB_DATA, notifiedHistoryId: '200' },
      deps,
    );

    expect(client.listHistory).not.toHaveBeenCalled();
    expect(dbMock.integration.update).not.toHaveBeenCalled();
  });
});

describe('calculateGmailSyncBackoff', () => {
  it('honors Retry-After and adds bounded jitter', () => {
    const error = new GmailApiError('quota', {
      kind: 'quota',
      status: 429,
      operation: 'users.history.list',
      retryAfterMs: 120_000,
    });

    expect(calculateGmailSyncBackoff(1, error, () => 0.5)).toBe(132_000);
  });

  it('stops retrying deterministic Gmail request failures', () => {
    const error = new GmailApiError('bad request', {
      kind: 'request',
      status: 400,
      operation: 'users.history.list',
    });

    expect(calculateGmailSyncBackoff(1, error)).toBe(-1);
    expect(calculateGmailSyncBackoff(1, new RangeError('unsafe recovery bound'))).toBe(-1);
  });

  it('uses exponential backoff for transient non-provider failures', () => {
    expect(calculateGmailSyncBackoff(3, new Error('Redis unavailable'), () => 0)).toBe(20_000);
  });

  it('uses the base delay without an error and caps extreme Retry-After values', () => {
    expect(calculateGmailSyncBackoff(1, undefined, () => 0)).toBe(5_000);
    const error = new GmailApiError('long quota pause', {
      kind: 'quota',
      status: 429,
      operation: 'users.history.list',
      retryAfterMs: 24 * 60 * 60 * 1_000,
    });
    expect(calculateGmailSyncBackoff(6, error, () => 1)).toBe(6 * 60 * 60 * 1_000);
  });
});
