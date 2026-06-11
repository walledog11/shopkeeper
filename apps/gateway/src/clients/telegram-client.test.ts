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

import { sendChatAction, sendMessage, setMessageReaction } from './telegram-client.js';

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

describe('sendChatAction', () => {
  it('returns true when Telegram accepts the typing action', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    try {
      await expect(sendChatAction('chat_1', 'typing')).resolves.toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-token/sendChatAction',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ chat_id: 'chat_1', action: 'typing' }),
        }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('returns false when the bot token is not configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    await expect(sendChatAction('chat_1', 'typing')).resolves.toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Telegram] TELEGRAM_BOT_TOKEN not set — skipping sendChatAction',
    );
  });

  it('returns false on HTTP failure without throwing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad request', { status: 400 }),
    );

    try {
      await expect(sendChatAction('chat_1', 'typing')).resolves.toBe(false);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('setMessageReaction', () => {
  it('returns true when Telegram accepts the reaction', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    try {
      await expect(setMessageReaction('chat_1', 42, '👀')).resolves.toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-token/setMessageReaction',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            chat_id: 'chat_1',
            message_id: 42,
            reaction: [{ type: 'emoji', emoji: '👀' }],
          }),
        }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('returns false when the bot token is not configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    await expect(setMessageReaction('chat_1', 42, '👀')).resolves.toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Telegram] TELEGRAM_BOT_TOKEN not set — skipping setMessageReaction',
    );
  });

  it('returns false on HTTP failure without throwing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad request', { status: 400 }),
    );

    try {
      await expect(setMessageReaction('chat_1', 42, '👀')).resolves.toBe(false);
    } finally {
      fetchSpy.mockRestore();
    }
  });
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
