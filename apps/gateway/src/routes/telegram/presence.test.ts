import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendChatActionSpy, setMessageReactionSpy } = vi.hoisted(() => ({
  sendChatActionSpy: vi.fn().mockResolvedValue(true),
  setMessageReactionSpy: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../clients/telegram-client.js', () => ({
  sendChatAction: sendChatActionSpy,
  setMessageReaction: setMessageReactionSpy,
}));

import { PROGRESS_THRESHOLD_MS, withOperatorPresence } from './presence.js';

describe('withOperatorPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendChatActionSpy.mockClear();
    setMessageReactionSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('propagates work errors and clears timers', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const work = vi.fn().mockRejectedValue(new Error('agent failed'));

    await expect(withOperatorPresence(
      {
        chatId: 'chat_4',
        reply,
        progress: { kind: 'free-form' },
      },
      work,
    )).rejects.toThrow('agent failed');

    await vi.advanceTimersByTimeAsync(PROGRESS_THRESHOLD_MS);
    expect(reply).not.toHaveBeenCalled();
  });
});
