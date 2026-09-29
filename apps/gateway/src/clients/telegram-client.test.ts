import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger, recordProviderSendFailureInBackgroundSpy } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  recordProviderSendFailureInBackgroundSpy: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../provider-send-alerts.js', () => ({
  recordProviderSendFailureInBackground: recordProviderSendFailureInBackgroundSpy,
}));

import { sendMessage } from './telegram-client.js';

const originalToken = process.env.TELEGRAM_BOT_TOKEN;

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  recordProviderSendFailureInBackgroundSpy.mockClear();
});

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.TELEGRAM_BOT_TOKEN;
  } else {
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
  }
});

describe('sendMessage', () => {
  it('returns false and records provider_send on HTTP failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad request', { status: 400 }),
    );

    try {
      await expect(
        sendMessage('chat_1', 'hello', { orgId: 'org_1', threadId: 'thread_1' }),
      ).resolves.toBe(false);

      expect(recordProviderSendFailureInBackgroundSpy).toHaveBeenCalledWith(
        'telegram',
        'operator_notify',
        'org_1',
        expect.objectContaining({
          threadId: 'thread_1',
          detail: 'bad request',
        }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('classifies a provider deadline without claiming the message was not delivered', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('timed out', 'TimeoutError'),
    );

    try {
      await expect(sendMessage('chat_1', 'hello', { orgId: 'org_1' })).rejects.toMatchObject({
        name: 'ExternalRequestTimeoutError',
        operation: 'message send',
        provider: 'telegram',
      });
      expect(recordProviderSendFailureInBackgroundSpy).toHaveBeenCalledWith(
        'telegram',
        'operator_notify',
        'org_1',
        expect.objectContaining({ detail: expect.stringContaining('timed out') }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
