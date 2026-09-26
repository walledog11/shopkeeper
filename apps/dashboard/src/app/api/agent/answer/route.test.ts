import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildContext,
  clearPlan,
  createMessage,
  decideAutonomy,
  findThread,
  getLatest,
  getOrg,
  planAgent,
  requireThread,
  saveAnswer,
  threadUpdate,
  authSpy,
  claimAnswered,
  failClaim,
  settleClaim,
  supportSettlement,
  taskCount,
} = vi.hoisted(() => ({
  buildContext: vi.fn(),
  clearPlan: vi.fn(),
  createMessage: vi.fn(),
  decideAutonomy: vi.fn(),
  findThread: vi.fn(),
  getLatest: vi.fn(),
  getOrg: vi.fn(),
  planAgent: vi.fn(),
  requireThread: vi.fn(),
  saveAnswer: vi.fn(),
  threadUpdate: vi.fn(),
  authSpy: vi.fn(),
  claimAnswered: vi.fn(),
  failClaim: vi.fn(),
  settleClaim: vi.fn(),
  supportSettlement: vi.fn(),
  taskCount: vi.fn(),
}));

vi.mock('@shopkeeper/db', async (importOriginal) => ({
  ...await importOriginal<typeof import('@shopkeeper/db')>(),
  db: {
    thread: { findFirst: findThread, update: threadUpdate },
    agentTask: { count: taskCount },
  },
  createMessage,
}));
vi.mock('@/lib/server/org', () => ({ getOrCreateOrg: getOrg }));
vi.mock('@/lib/server/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 19, reset: 0 }),
  tooManyRequests: vi.fn(),
}));
vi.mock('@/lib/server/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@shopkeeper/agent/thread-auth', () => ({
  getLatestConversationMessage: getLatest,
  requireOrgThread: requireThread,
}));
vi.mock('@shopkeeper/agent/plan-execution', () => ({
  clearThreadPlanCache: clearPlan,
  supportAttemptSettlement: supportSettlement,
}));
// The ledger's own behaviour is covered against a real database in
// packages/agent; what this surface owns is reaching it with the authenticated
// member and settling what its re-plan actually parked.
vi.mock('@shopkeeper/agent/task-ledger', () => ({
  claimContinuedAgentTask: claimAnswered,
  failAgentTaskClaim: failClaim,
  settleAgentTaskClaim: settleClaim,
}));
vi.mock('@clerk/nextjs/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('@clerk/nextjs/server')>(),
  auth: authSpy,
}));
vi.mock('@shopkeeper/agent/merchant-answer-kb', () => ({
  saveMerchantAnswerToKb: saveAnswer,
}));
vi.mock('@shopkeeper/agent/kb-learned', () => ({
  buildMerchantAnswerPlanningInstruction: vi.fn(() => 'answer-informed instruction'),
}));
vi.mock('@shopkeeper/agent/plan-cache', () => ({
  buildAgentPlanCacheRecord: vi.fn(() => ({ version: 1, plan: {} })),
}));
vi.mock('@shopkeeper/agent/plan-cache-shape', () => ({
  extractCachedQuestion: vi.fn(() => 'What is the international shipping price?'),
  getPendingCustomerMessageId: vi.fn((messages: unknown[]) => messages.length ? 'message-1' : null),
}));
vi.mock('@shopkeeper/agent/autonomy', () => ({
  decideAutonomy,
}));
vi.mock('@shopkeeper/agent/settings', () => ({
  resolveAgentSettings: vi.fn(() => ({ autonomyLevel: 'draft' })),
}));
vi.mock('@/lib/agent/runner', () => ({
  buildContext,
  hashInstructionForLog: vi.fn(() => 'instruction-hash'),
  planAgent,
}));

import { POST } from './route';

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/agent/answer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      threadId: '11111111-1111-4111-8111-111111111111',
      answer: '$15 flat rate',
      saveToKb: false,
      ...overrides,
    }),
  });
}

describe('POST /api/agent/answer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrg.mockResolvedValue({
      id: 'org-1',
      settings: {},
      stripeStatus: 'active',
    });
    requireThread.mockResolvedValue({
      channelType: 'email',
      aiSummary: 'Customer asked about international shipping.',
      cachedPlan: { plan: {} },
      cachedPlanMessageId: 'message-1',
    });
    findThread.mockResolvedValue({ tag: 'Shipping' });
    createMessage.mockResolvedValue({});
    clearPlan.mockResolvedValue(undefined);
    saveAnswer.mockResolvedValue({ title: 'International shipping', body: '$15 flat rate' });
    threadUpdate.mockResolvedValue({});
    buildContext.mockResolvedValue({ thread: { id: 'thread-1' } });
    planAgent.mockResolvedValue({ instruction: 'reply', steps: [], rawToolCalls: [] });
    authSpy.mockResolvedValue({ userId: 'user_1' });
    claimAnswered.mockResolvedValue(null);
    taskCount.mockResolvedValue(0);
    settleClaim.mockResolvedValue(true);
    failClaim.mockResolvedValue('failed');
    supportSettlement.mockResolvedValue({ status: 'completed' });
    decideAutonomy.mockReturnValue({
      kind: 'quick_reply',
      reasons: ['safe_quick_reply'],
      toolCalls: [],
      replyText: 'Shipping is $15.',
      sendReplyToolCall: { id: 'reply-1', name: 'send_reply', input: { text: 'Shipping is $15.' } },
    });
  });

  it('records an answer and clears a stale plan when the customer is already answered', async () => {
    getLatest.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(createMessage).toHaveBeenCalledWith({
      threadId: '11111111-1111-4111-8111-111111111111',
      senderType: 'note',
      contentText: expect.stringContaining('A: $15 flat rate'),
    });
    expect(clearPlan).toHaveBeenCalledWith({
      orgId: 'org-1',
      threadId: '11111111-1111-4111-8111-111111111111',
    });
    expect(planAgent).not.toHaveBeenCalled();
  });

  it('saves reusable answers and pins the article while re-planning', async () => {
    getLatest.mockResolvedValue({ id: 'message-1', senderType: 'customer' });

    const response = await POST(request({ saveToKb: true }));

    expect(response.status).toBe(200);
    expect(saveAnswer).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      answer: '$15 flat rate',
      question: 'What is the international shipping price?',
      threadTag: 'Shipping',
    }));
    expect(buildContext).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'org-1',
      { pinKbArticles: [{ title: 'International shipping', body: '$15 flat rate' }] },
    );
    expect(threadUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: '11111111-1111-4111-8111-111111111111' },
      data: expect.objectContaining({ cachedPlanMessageId: 'message-1' }),
    }));
    await expect(response.json()).resolves.toEqual({
      kind: 'quick_reply',
      question: null,
      replyText: 'Shipping is $15.',
    });
  });

  it('returns a follow-up merchant question without inventing reply text', async () => {
    getLatest.mockResolvedValue({ id: 'message-1', senderType: 'customer' });
    decideAutonomy.mockReturnValueOnce({
      kind: 'needs_merchant_input',
      reasons: ['explicit_merchant_question'],
      question: 'Do we ship to military addresses?',
    });

    const response = await POST(request());

    await expect(response.json()).resolves.toEqual({
      kind: 'needs_merchant_input',
      question: 'Do we ship to military addresses?',
      replyText: null,
    });
  });

  it('keeps the exact-draft proposal contract when an answer resumes planning', async () => {
    const previous = process.env.AGENT_PROPOSAL_SUSPENSION_MODE;
    process.env.AGENT_PROPOSAL_SUSPENSION_MODE = 'compose_from_receipt';
    try {
      getLatest.mockResolvedValue({ id: 'message-1', senderType: 'customer' });
      const response = await POST(request());
      expect(response.status).toBe(200);
      expect(planAgent).toHaveBeenCalledWith(
        expect.anything(),
        'answer-informed instruction',
        expect.anything(),
        { exactDraftProposal: true },
      );
    } finally {
      if (previous === undefined) delete process.env.AGENT_PROPOSAL_SUSPENSION_MODE;
      else process.env.AGENT_PROPOSAL_SUSPENSION_MODE = previous;
    }
  });

  describe('durable continuation', () => {
    const continuation = {
      organizationId: 'org-1', taskId: 'task-1', expectedRevision: 3,
      claimToken: 'claim-1', requestId: 'request-1', runtimeVersion: 2,
    };

    beforeEach(() => {
      taskCount.mockResolvedValue(1);
    });

    it('ends the wait its answer was asked under and settles what the re-plan parked', async () => {
      getLatest.mockResolvedValue({ id: 'message-1', senderType: 'customer' });
      claimAnswered.mockResolvedValue(continuation);
      supportSettlement.mockResolvedValue({ status: 'waiting_approval' });

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(claimAnswered).toHaveBeenCalledWith({
        organizationId: 'org-1',
        clerkUserId: 'user_1',
        threadId: '11111111-1111-4111-8111-111111111111',
        // This surface answers questions; it has no revise button, and ending
        // an approval wait with an answer is a different decision.
        endsWait: 'question',
        continuationInstruction: '$15 flat rate',
        continuationChannel: 'operator',
      });
      expect(supportSettlement).toHaveBeenCalledWith(expect.objectContaining({
        orgId: 'org-1',
        allowMutativeAutoExecute: false,
        merchantQuestion: null,
        sourceRequestIds: ['request-1'],
      }));
      expect(settleClaim).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-1', claimToken: 'claim-1', expectedRevision: 3,
        settlement: { status: 'waiting_approval' },
      }));
      expect(failClaim).not.toHaveBeenCalled();
    });

    it('records a re-asked question as the wait the next answer continues', async () => {
      getLatest.mockResolvedValue({ id: 'message-1', senderType: 'customer' });
      claimAnswered.mockResolvedValue(continuation);
      decideAutonomy.mockReturnValueOnce({
        kind: 'needs_merchant_input',
        reasons: ['explicit_merchant_question'],
        question: 'Do we ship to military addresses?',
      });

      await POST(request());

      expect(supportSettlement).toHaveBeenCalledWith(expect.objectContaining({
        merchantQuestion: 'Do we ship to military addresses?',
      }));
    });

    it('closes the task when the ticket was already handled', async () => {
      getLatest.mockResolvedValue(null);
      claimAnswered.mockResolvedValue(continuation);

      await POST(request());

      expect(planAgent).not.toHaveBeenCalled();
      expect(settleClaim).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-1', settlement: { status: 'completed' },
      }));
    });

    it('fails the task rather than leaving it claimed when the re-plan throws', async () => {
      getLatest.mockResolvedValue({ id: 'message-1', senderType: 'customer' });
      claimAnswered.mockResolvedValue(continuation);
      planAgent.mockRejectedValue(new Error('boom'));

      const response = await POST(request());

      expect(response.status).toBe(500);
      expect(failClaim).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-1', claimToken: 'claim-1', failureCode: 'answer_replan_failed',
      }));
      expect(settleClaim).not.toHaveBeenCalled();
    });

    it('re-plans untracked when nothing on the thread is waiting on this member', async () => {
      getLatest.mockResolvedValue({ id: 'message-1', senderType: 'customer' });
      claimAnswered.mockResolvedValue(null);
      taskCount.mockResolvedValue(0);

      expect((await POST(request())).status).toBe(200);
      expect(planAgent).toHaveBeenCalledTimes(1);
      expect(settleClaim).not.toHaveBeenCalled();
      expect(failClaim).not.toHaveBeenCalled();
    });
  });

  it('validates the answer before any persistence', async () => {
    const response = await POST(request({ answer: '   ' }));

    expect(response.status).toBe(400);
    expect(createMessage).not.toHaveBeenCalled();
    expect(saveAnswer).not.toHaveBeenCalled();
  });
});
