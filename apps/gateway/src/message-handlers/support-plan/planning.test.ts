import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBurst,
  mockFindThread,
  mockGenerateThreadPlan,
  mockLogger,
  mockRequestAutoAck,
} = vi.hoisted(() => ({
  mockBurst: vi.fn(),
  mockFindThread: vi.fn(),
  mockGenerateThreadPlan: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  mockRequestAutoAck: vi.fn(),
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

vi.mock('../../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../inbound/conversation-burst.js', () => ({ getConversationBurst: mockBurst }));
vi.mock('./generate-thread-plan.js', () => ({ generateThreadPlan: mockGenerateThreadPlan }));
vi.mock('./plan-limit.js', () => ({
  degradeForConversationLimit: vi.fn(async () => false),
}));
vi.mock('./planning-dashboard-client.js', () => ({
  requestAutoAck: mockRequestAutoAck,
}));

import { precomputeThreadPlan, sendAutoAck, shouldSkipRequestWork } from './planning.js';

beforeEach(() => {
  mockLogger.debug.mockClear();
  mockLogger.error.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockRequestAutoAck.mockReset();
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
  it('publishes an invalid plan even when it has no visible steps', async () => {
    mockGenerateThreadPlan.mockResolvedValue({
      plan: {
        steps: [],
        rawToolCalls: [{ id: 'call_1', name: 'send_reply', input: { text: '' } }],
        validation: {
          status: 'invalid',
          issues: [{ code: 'invalid_tool_input', message: 'The reply text cannot be blank.' }],
        },
      },
      instruction: 'Handle this request',
    });

    await expect(precomputeThreadPlan(
      'org_1',
      'thread_1',
      { autoPlanOnOpen: true },
    )).resolves.toMatchObject({ plan: { validation: { status: 'invalid' } } });
  });

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
    mockRequestAutoAck.mockResolvedValueOnce({ ok: true, data: { ok: true } });

    await sendAutoAck('org_1', 'thread_1');

    expect(mockRequestAutoAck).toHaveBeenCalledWith('thread_1');
    expect(mockLogger.info).toHaveBeenCalledWith(
      { threadId: 'thread_1', organizationId: 'org_1' },
      '[Worker] Auto-ack sent to customer',
    );
  });

  it('preserves skipped and failed dispatch warnings', async () => {
    mockRequestAutoAck
      .mockResolvedValueOnce({ ok: true, data: { ok: true, skipped: true } })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        responseBody: 'unavailable',
        outcome: 'failed',
      });

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
  });

  it('logs ambiguous dispatch outcomes without claiming a definite failure', async () => {
    mockRequestAutoAck.mockResolvedValueOnce({
      ok: false,
      status: null,
      responseBody: 'network down',
      outcome: 'unknown',
    });

    await expect(sendAutoAck('org_1', 'thread_1')).resolves.toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { status: null, outcome: 'unknown', threadId: 'thread_1', organizationId: 'org_1' },
      '[Worker] Auto-ack dispatch outcome unknown',
    );
  });
});
