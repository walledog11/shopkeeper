import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger, sendMessageSpy, updateContextSpy } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  sendMessageSpy: vi.fn(),
  updateContextSpy: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  default: mockLogger,
}));

vi.mock('./clients/telegram-client.js', () => ({
  isTelegramConfigured: vi.fn(() => true),
  sendMessage: sendMessageSpy,
}));

vi.mock('./operator-context.js', () => ({
  updateContext: updateContextSpy,
}));

import { isTelegramConfigured } from './clients/telegram-client.js';
import { notifyOperator, OperatorNotifyError } from './operator-notify.js';

beforeEach(() => {
  vi.mocked(isTelegramConfigured).mockReturnValue(true);
  sendMessageSpy.mockReset();
  updateContextSpy.mockReset().mockResolvedValue(undefined);
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
});

describe('notifyOperator', () => {
  it('updates context and returns the chat id on success', async () => {
    sendMessageSpy.mockResolvedValue(true);

    const result = await notifyOperator(
      'org_1',
      { chatId: 'chat_1' },
      'hello',
      { pendingPlan: null },
    );

    expect(result).toEqual({ chatId: 'chat_1' });
    expect(updateContextSpy).toHaveBeenCalledWith('org_1', 'chat_1', { pendingPlan: null });
  });

  it('returns null on best-effort HTTP send failure without updating context', async () => {
    sendMessageSpy.mockResolvedValue(false);

    const result = await notifyOperator(
      'org_1',
      { chatId: 'chat_1' },
      'hello',
      { pendingPlan: null },
    );

    expect(result).toBeNull();
    expect(updateContextSpy).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { chatId: 'chat_1', organizationId: 'org_1' },
      '[OperatorNotify] Telegram send failed — skipping context update',
    );
  });

  it('throws on critical HTTP send failure', async () => {
    sendMessageSpy.mockResolvedValue(false);

    await expect(
      notifyOperator(
        'org_1',
        { chatId: 'chat_1' },
        'approve this plan',
        { pendingPlan: null },
        { policy: 'critical', threadId: 'thread_1' },
      ),
    ).rejects.toThrow(OperatorNotifyError);

    expect(updateContextSpy).not.toHaveBeenCalled();
  });

  it('throws on critical network send failure', async () => {
    sendMessageSpy.mockRejectedValue(new Error('network down'));

    await expect(
      notifyOperator(
        'org_1',
        { chatId: 'chat_1' },
        'escalation',
        {},
        { policy: 'critical', threadId: 'thread_1' },
      ),
    ).rejects.toThrow(OperatorNotifyError);

    expect(updateContextSpy).not.toHaveBeenCalled();
  });

  it('returns null on best-effort network send failure', async () => {
    sendMessageSpy.mockRejectedValue(new Error('network down'));

    const result = await notifyOperator(
      'org_1',
      { chatId: 'chat_1' },
      'digest',
      {},
    );

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: 'network down', chatId: 'chat_1', organizationId: 'org_1' },
      '[OperatorNotify] Telegram send failed',
    );
  });

  it('throws when Telegram is not configured on critical paths', async () => {
    vi.mocked(isTelegramConfigured).mockReturnValue(false);

    await expect(
      notifyOperator(
        'org_1',
        { chatId: 'chat_1' },
        'escalation',
        {},
        { policy: 'critical' },
      ),
    ).rejects.toThrow('Telegram not configured');
  });

  it('returns null when Telegram is not configured on best-effort paths', async () => {
    vi.mocked(isTelegramConfigured).mockReturnValue(false);

    const result = await notifyOperator(
      'org_1',
      { chatId: 'chat_1' },
      'digest',
      {},
    );

    expect(result).toBeNull();
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });
});
