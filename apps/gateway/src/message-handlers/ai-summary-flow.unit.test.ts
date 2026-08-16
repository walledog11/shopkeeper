import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findThread: vi.fn(),
  findOrganization: vi.fn(),
  latestConversation: vi.fn(),
  requireOrgThread: vi.fn(),
  readPlanCache: vi.fn(),
  consumePlanCache: vi.fn(),
  intelligence: vi.fn(),
  precompute: vi.fn(),
  autoAck: vi.fn(),
  autoNotification: vi.fn(),
  burst: vi.fn(),
  planNotification: vi.fn(),
  questionNotification: vi.fn(),
  withinBusinessHours: vi.fn(),
}));

vi.mock('@shopkeeper/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopkeeper/db')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      thread: { ...actual.db.thread, findUnique: mocks.findThread },
      organization: { ...actual.db.organization, findUnique: mocks.findOrganization },
    },
  };
});

vi.mock('@shopkeeper/agent/thread-auth', () => ({
  getLatestConversationMessage: mocks.latestConversation,
  getLatestCustomerMessageText: vi.fn(),
  requireOrgThread: mocks.requireOrgThread,
}));

vi.mock('@shopkeeper/agent/plan-cache', () => ({
  readAgentPlanCache: mocks.readPlanCache,
}));

vi.mock('@shopkeeper/agent/plan-execution', () => ({
  consumeThreadCachedPlan: mocks.consumePlanCache,
}));

vi.mock('@shopkeeper/agent/settings', () => ({
  resolveAgentSettings: vi.fn(() => ({ autoPlanOnOpen: true })),
  isWithinBusinessHours: mocks.withinBusinessHours,
}));

vi.mock('./intelligence.js', () => ({ generateThreadIntelligence: mocks.intelligence }));
vi.mock('./conversation-burst.js', () => ({ getConversationBurst: mocks.burst }));
vi.mock('./planning.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./planning.js')>(),
  precomputeThreadPlan: mocks.precompute,
  sendAutoAck: mocks.autoAck,
}));
vi.mock('./planning-notifications.js', () => ({
  sendOperatorAutoExecutionNotification: mocks.autoNotification,
  sendOperatorPlanNotification: mocks.planNotification,
  sendOperatorQuestionNotification: mocks.questionNotification,
}));

import { processAiSummaryJob } from './ai-summary-flow.js';
import { mayParkMerchantWork } from './planning-types.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findThread.mockResolvedValue({
    channelType: 'email',
    filterDecidedAt: null,
    filterStatus: 'genuine',
    requestSourceMessageId: null,
  });
  mocks.findOrganization.mockResolvedValue({ settings: {} });
  mocks.latestConversation.mockResolvedValue({ id: 'message_1', senderType: 'customer' });
  mocks.intelligence.mockResolvedValue({
    filterStatus: 'genuine',
    aiSummary: 'Needs an order lookup.',
    requestDisposition: 'merchant_action',
    requestSourceMessageId: 'message_1',
  });
  mocks.burst.mockResolvedValue({
    isFollowUp: false,
    messages: [{ id: 'message_1', contentText: 'Please refund my order.' }],
  });
  mocks.withinBusinessHours.mockReturnValue(false);
  mocks.readPlanCache.mockReturnValue({ planId: 'plan_1' });
  mocks.requireOrgThread.mockResolvedValue({
    cachedPlan: {},
    cachedPlanMessageId: 'message_1',
    requestSourceMessageId: 'message_1',
    requestDisposition: 'merchant_action',
    requestSummary: 'Customer asks for a refund on order #1042.',
  });
});

// A plan carrying an identity is the only kind the publish gate inspects.
const PLAN_WITH_IDENTITY = {
  plan: { steps: [{ tool: 'refund_order' }], rawToolCalls: [] },
  instruction: 'Refund order #1042',
  identity: { planId: 'plan_1', sourceMessageId: 'message_1' },
};

const JOB = {
  threadId: 'thread_1',
  organizationId: 'org_1',
  sourceMessageId: 'message_1',
  customerName: null,
  channelType: 'email' as const,
};

describe('processAiSummaryJob merchant-work gate', () => {
  beforeEach(() => {
    mocks.withinBusinessHours.mockReturnValue(true);
    mocks.precompute.mockResolvedValue(PLAN_WITH_IDENTITY);
  });

  it('does not park a card for a request that asked for nothing', async () => {
    mocks.requireOrgThread.mockResolvedValue({
      cachedPlan: {},
      cachedPlanMessageId: 'message_1',
      requestSourceMessageId: 'message_1',
      requestDisposition: 'acknowledgement',
      requestSummary: 'Customer says thanks.',
    });
    mocks.burst.mockResolvedValue({
      isFollowUp: false,
      messages: [
        { id: 'message_0', contentText: 'Hello.' },
        { id: 'message_1', contentText: 'Thanks!' },
      ],
    });

    await processAiSummaryJob(JOB);

    expect(mocks.planNotification).not.toHaveBeenCalled();
    expect(mocks.questionNotification).not.toHaveBeenCalled();
    // The dashboard home reads the same cache, so leaving it would raise a card
    // for the greeting the phone was just told not to mention.
    expect(mocks.consumePlanCache).toHaveBeenCalledWith({
      orgId: 'org_1',
      threadId: 'thread_1',
      lastCustomerMessageId: 'message_1',
    });
  });

  it('parks a real ask and hands the notification the request, not the episode', async () => {
    await processAiSummaryJob(JOB);

    expect(mocks.consumePlanCache).not.toHaveBeenCalled();
    expect(mocks.planNotification).toHaveBeenCalledOnce();
    expect(mocks.planNotification.mock.calls[0]![4]).toBe(
      'Customer asks for a refund on order #1042.',
    );
  });

  it('does not suppress an earlier request with a latest-email preclassification', async () => {
    mocks.requireOrgThread.mockResolvedValue({
      cachedPlan: {},
      cachedPlanMessageId: 'message_1',
      requestSourceMessageId: 'message_1',
      requestDisposition: 'acknowledgement',
      requestSummary: 'Customer says thanks.',
    });
    mocks.burst.mockResolvedValue({
      isFollowUp: false,
      messages: [
        { id: 'message_0', contentText: 'Where is my order?' },
        { id: 'message_1', contentText: 'Thanks!' },
      ],
    });

    await processAiSummaryJob({ ...JOB, skipSummary: true });

    expect(mocks.consumePlanCache).not.toHaveBeenCalled();
    expect(mocks.planNotification).toHaveBeenCalledOnce();
  });

  it('never suppresses on a verdict written against an older request', async () => {
    // The classifier compare-and-sets, so a burst that moved leaves the previous
    // request's disposition behind. Trusting it here would drop the refund
    // because the message before it was "thanks".
    mocks.requireOrgThread.mockResolvedValue({
      cachedPlan: {},
      cachedPlanMessageId: 'message_1',
      requestSourceMessageId: 'message_0',
      requestDisposition: 'acknowledgement',
      requestSummary: 'Customer says thanks.',
    });

    await processAiSummaryJob(JOB);

    expect(mocks.consumePlanCache).not.toHaveBeenCalled();
    expect(mocks.planNotification).toHaveBeenCalledOnce();
    // The stale summary is withheld too — the builder falls back to the
    // instruction rather than labelling the wrong request as what just arrived.
    expect(mocks.planNotification.mock.calls[0]![4]).toBeNull();
  });

  it('drops a superseded plan without clearing a newer one from the cache', async () => {
    mocks.requireOrgThread.mockResolvedValue({
      cachedPlan: {},
      cachedPlanMessageId: 'message_2',
      requestSourceMessageId: 'message_2',
      requestDisposition: 'merchant_action',
      requestSummary: 'Customer asks for a refund on order #1042.',
    });

    await processAiSummaryJob(JOB);

    expect(mocks.planNotification).not.toHaveBeenCalled();
    expect(mocks.consumePlanCache).not.toHaveBeenCalled();
  });

  it('lets the safe-reply lane answer a greeting instead of reporting it', async () => {
    mocks.precompute.mockResolvedValue({
      plan: { steps: [{ tool: 'send_reply' }], rawToolCalls: [] },
      instruction: 'Say hello back',
      autoExecuted: true,
      autoExecutionKind: 'safe_reply',
      autoExecutionStatus: 'success',
    });

    await processAiSummaryJob(JOB);

    expect(mocks.autoNotification).not.toHaveBeenCalled();
    expect(mocks.planNotification).not.toHaveBeenCalled();
    expect(mocks.consumePlanCache).not.toHaveBeenCalled();
  });
});

describe('processAiSummaryJob safe replies', () => {
  it.each(['none', 'acknowledgement'])('does not auto-ack an off-hours %s request', async (requestDisposition) => {
    mocks.precompute.mockResolvedValue(null);
    mocks.intelligence.mockResolvedValue({
      filterStatus: 'genuine',
      requestDisposition,
      requestSourceMessageId: 'message_1',
    });

    await processAiSummaryJob(JOB);

    expect(mocks.autoAck).not.toHaveBeenCalled();
  });

  it('still auto-acks off hours when an earlier customer request is unanswered', async () => {
    mocks.precompute.mockResolvedValue(PLAN_WITH_IDENTITY);
    mocks.intelligence.mockResolvedValue({
      filterStatus: 'genuine',
      requestDisposition: 'acknowledgement',
      requestSourceMessageId: 'message_1',
    });
    mocks.burst.mockResolvedValue({
      isFollowUp: false,
      messages: [
        { id: 'message_0', contentText: 'Where is my order?' },
        { id: 'message_1', contentText: 'Thanks!' },
      ],
    });

    await processAiSummaryJob({ ...JOB, skipSummary: true });

    expect(mocks.autoAck).toHaveBeenCalledWith('org_1', 'thread_1');
  });

  it('uses a successful clarification reply instead of an outside-hours auto-ack or merchant notification', async () => {
    mocks.precompute.mockResolvedValue({
      plan: { steps: [{ tool: 'send_reply' }], rawToolCalls: [] },
      instruction: 'Ask for the order number',
      autoExecuted: true,
      autoExecutionKind: 'safe_reply',
      autoExecutionStatus: 'success',
    });

    await processAiSummaryJob({
      threadId: 'thread_1',
      organizationId: 'org_1',
      sourceMessageId: 'message_1',
      customerName: null,
      channelType: 'email',
    });

    expect(mocks.precompute).toHaveBeenCalledWith(
      'org_1',
      'thread_1',
      expect.anything(),
      expect.objectContaining({ allowAutoExecute: false }),
    );
    expect(mocks.autoAck).not.toHaveBeenCalled();
    expect(mocks.autoNotification).not.toHaveBeenCalled();
    expect(mocks.planNotification).not.toHaveBeenCalled();
  });

  it('notifies the merchant when the automatic clarification itself fails', async () => {
    mocks.precompute.mockResolvedValue({
      plan: { steps: [{ tool: 'send_reply' }], rawToolCalls: [] },
      instruction: 'Ask for the order number',
      autoExecuted: true,
      autoExecutionKind: 'safe_reply',
      autoExecutionStatus: 'error',
      autoExecutionError: 'Provider unavailable',
    });

    await processAiSummaryJob({
      threadId: 'thread_1',
      organizationId: 'org_1',
      sourceMessageId: 'message_1',
      customerName: null,
      channelType: 'email',
    });

    expect(mocks.autoAck).not.toHaveBeenCalled();
    expect(mocks.autoNotification).toHaveBeenCalledOnce();
  });
});

describe('mayParkMerchantWork', () => {
  it('refuses to park work for a request that asked for nothing', () => {
    expect(mayParkMerchantWork('none')).toBe(false);
    expect(mayParkMerchantWork('acknowledgement')).toBe(false);
  });

  it('parks work for a real ask, and for anything it cannot read', () => {
    expect(mayParkMerchantWork('merchant_action')).toBe(true);
    expect(mayParkMerchantWork('unclear')).toBe(true);
    // A null disposition is every thread the classifier has not verdicted yet
    // and every proactive monitor thread. Treating it as `none` would let an
    // absent verdict swallow a refund request.
    expect(mayParkMerchantWork(null)).toBe(true);
    expect(mayParkMerchantWork(undefined)).toBe(true);
  });

  it('leaves informational eligible so a declined safe reply still surfaces', () => {
    // The safe-reply lane answers routine questions without asking anyone, so a
    // plan that reaches the parking decision is one that lane declined. Dropping
    // it would answer nobody and tell nobody.
    expect(mayParkMerchantWork('informational')).toBe(true);
  });
});
