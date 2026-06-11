import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendChatActionSpy, setMessageReactionSpy } = vi.hoisted(() => ({
  sendChatActionSpy: vi.fn().mockResolvedValue(true),
  setMessageReactionSpy: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../clients/telegram-client.js', () => ({
  sendChatAction: sendChatActionSpy,
  setMessageReaction: setMessageReactionSpy,
}));

import {
  PROGRESS_THRESHOLD_MS,
  RECEIPT_REACTION_EMOJI,
  TYPING_REFRESH_MS,
  withOperatorPresence,
} from './presence.js';

describe('withOperatorPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendChatActionSpy.mockClear();
    setMessageReactionSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows typing only for fast work and does not send progress text', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const work = vi.fn().mockResolvedValue('done');

    const resultPromise = withOperatorPresence(
      {
        chatId: 'chat_1',
        reply,
        progress: { kind: 'free-form' },
      },
      work,
    );

    await vi.advanceTimersByTimeAsync(500);
    await resultPromise;

    expect(sendChatActionSpy).toHaveBeenCalledWith('chat_1', 'typing');
    expect(setMessageReactionSpy).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(work).toHaveBeenCalledOnce();
  });

  it('reacts to the inbound message before showing typing', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const work = vi.fn().mockResolvedValue('done');

    await withOperatorPresence(
      {
        chatId: 'chat_1',
        messageId: 99,
        reply,
        progress: { kind: 'free-form' },
      },
      work,
    );

    expect(setMessageReactionSpy).toHaveBeenCalledWith('chat_1', 99, RECEIPT_REACTION_EMOJI);
    expect(sendChatActionSpy).toHaveBeenCalledWith('chat_1', 'typing');
  });

  it('sends one progress message after the threshold while work is still running', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    let resolveWork: (value: string) => void = () => {};
    const work = vi.fn(() => new Promise<string>((resolve) => {
      resolveWork = resolve;
    }));

    const resultPromise = withOperatorPresence(
      {
        chatId: 'chat_2',
        messageId: 12,
        reply,
        progress: { kind: 'plan-run', orderNumber: '#42' },
      },
      work,
    );

    await vi.advanceTimersByTimeAsync(PROGRESS_THRESHOLD_MS);
    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith('Running the approved plan for #42…');

    resolveWork('finished');
    await vi.advanceTimersByTimeAsync(0);
    await resultPromise;

    expect(reply).toHaveBeenCalledOnce();
    expect(sendChatActionSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(setMessageReactionSpy).toHaveBeenCalledWith('chat_2', 12, RECEIPT_REACTION_EMOJI);
  });

  it('refreshes typing while work runs', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    let resolveWork: (value: string) => void = () => {};
    const work = vi.fn(() => new Promise<string>((resolve) => {
      resolveWork = resolve;
    }));

    const resultPromise = withOperatorPresence(
      {
        chatId: 'chat_3',
        reply,
        progress: { kind: 'digest-reply', ticketIndex: 1 },
      },
      work,
    );

    await vi.advanceTimersByTimeAsync(TYPING_REFRESH_MS);
    expect(sendChatActionSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    resolveWork('sent');
    await vi.advanceTimersByTimeAsync(0);
    await resultPromise;
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
