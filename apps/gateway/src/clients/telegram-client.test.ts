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
  mockLogger.warn.mockClear();
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
  it('returns true when Telegram accepts the message', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    try {
      await expect(sendMessage('chat_1', 'hello')).resolves.toBe(true);
      expect(recordProviderSendFailureInBackgroundSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

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

  it('returns false when the bot token is not configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    await expect(sendMessage('chat_1', 'hello')).resolves.toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Telegram] TELEGRAM_BOT_TOKEN not set — skipping sendMessage',
    );
  });

  it('rethrows network errors after recording provider_send', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    try {
      await expect(sendMessage('chat_1', 'hello', { orgId: 'org_1' })).rejects.toThrow('network down');
      expect(recordProviderSendFailureInBackgroundSpy).toHaveBeenCalledWith(
        'telegram',
        'operator_notify',
        'org_1',
        expect.objectContaining({ detail: 'network down' }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
