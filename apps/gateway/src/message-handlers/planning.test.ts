import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockBurst, mockFindThread, mockGenerateThreadPlan, mockLogger } = vi.hoisted(() => ({
  mockBurst: vi.fn(),
  mockFindThread: vi.fn(),
  mockGenerateThreadPlan: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@shopkeeper/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopkeeper/db')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      thread: { ...actual.db.thread, findUnique: mockFindThread },
    },
  };
});

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('./conversation-burst.js', () => ({ getConversationBurst: mockBurst }));
vi.mock('./generate-thread-plan.js', () => ({ generateThreadPlan: mockGenerateThreadPlan }));

import { precomputeThreadPlan, sendAutoAck, shouldSkipRequestWork } from './planning.js';

beforeEach(() => {
  mockLogger.debug.mockClear();
  mockLogger.error.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockFindThread.mockReset().mockResolvedValue({
    status: 'open',
    requestDisposition: 'merchant_action',
    requestSourceMessageId: 'message_1',
  });
  mockBurst.mockReset().mockResolvedValue({
    isFollowUp: false,
    messages: [{ id: 'message_1', contentText: 'Please refund my order.' }],
  });
  mockGenerateThreadPlan.mockReset().mockResolvedValue({
    plan: { steps: [{ tool: 'send_reply' }], rawToolCalls: [] },
    instruction: 'Handle this request',
  });
});

describe('precomputeThreadPlan', () => {
  it('does not apply the request-specific gate without a source message id', () => {
    expect(shouldSkipRequestWork(
      { requestDisposition: 'none', requestSourceMessageId: null },
      { isFollowUp: false, messages: [] },
    )).toBe(false);
  });

  it.each(['none', 'acknowledgement'])('skips planning for a current %s request', async (requestDisposition) => {
    mockFindThread.mockResolvedValue({
      status: 'open',
      requestDisposition,
      requestSourceMessageId: 'message_1',
    });

    await expect(precomputeThreadPlan(
      'org_1',
      'thread_1',
      { autoPlanOnOpen: true },
      { sourceMessageId: 'message_1' },
    )).resolves.toBeNull();
    expect(mockGenerateThreadPlan).not.toHaveBeenCalled();
  });

  it('still plans when a preclassified acknowledgement follows an earlier unanswered request', async () => {
    mockFindThread.mockResolvedValue({
      status: 'open',
      requestDisposition: 'acknowledgement',
      requestSourceMessageId: 'message_1',
    });
    mockBurst.mockResolvedValue({
      isFollowUp: false,
      messages: [
        { id: 'message_0', contentText: 'Where is my order?' },
        { id: 'message_1', contentText: 'Thanks!' },
      ],
    });

    await precomputeThreadPlan(
      'org_1',
      'thread_1',
      { autoPlanOnOpen: true },
      { sourceMessageId: 'message_1', skipSummary: true },
    );

    expect(mockGenerateThreadPlan).toHaveBeenCalledOnce();
  });

  it('skips planning when a whole-burst classifier finds no merchant work', async () => {
    mockFindThread.mockResolvedValue({
      status: 'open',
      requestDisposition: 'acknowledgement',
      requestSourceMessageId: 'message_1',
    });
    mockBurst.mockResolvedValue({
      isFollowUp: false,
      messages: [
        { id: 'message_0', contentText: 'Where is my order?' },
        { id: 'message_1', contentText: 'Thanks!' },
      ],
    });

    await expect(precomputeThreadPlan(
      'org_1',
      'thread_1',
      { autoPlanOnOpen: true },
      { sourceMessageId: 'message_1' },
    )).resolves.toBeNull();
    expect(mockGenerateThreadPlan).not.toHaveBeenCalled();
  });
});

describe('sendAutoAck', () => {
  it('dispatches through the dashboard internal API and logs success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    try {
      await sendAutoAck('org_1', 'thread_1');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/messages\/auto-ack$/);
      expect(init).toMatchObject({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET,
        },
        body: JSON.stringify({ threadId: 'thread_1' }),
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        { threadId: 'thread_1', organizationId: 'org_1' },
        '[Worker] Auto-ack sent to customer',
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('preserves skipped and failed dispatch warnings', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }));

    try {
      await sendAutoAck('org_1', 'thread_skipped');
      await sendAutoAck('org_1', 'thread_failed');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { threadId: 'thread_skipped', organizationId: 'org_1' },
        '[Worker] Auto-ack skipped by dashboard — check businessHoursEnabled setting sync',
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { status: 503, outcome: 'failed', threadId: 'thread_failed', organizationId: 'org_1' },
        '[Worker] Auto-ack dispatch failed',
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('logs ambiguous dispatch outcomes without claiming a definite failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    try {
      await expect(sendAutoAck('org_1', 'thread_1')).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { status: null, outcome: 'unknown', threadId: 'thread_1', organizationId: 'org_1' },
        '[Worker] Auto-ack dispatch outcome unknown',
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
