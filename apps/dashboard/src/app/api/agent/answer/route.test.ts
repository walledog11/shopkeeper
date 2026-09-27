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

  it('validates the answer before any persistence', async () => {
    const response = await POST(request({ answer: '   ' }));

    expect(response.status).toBe(400);
    expect(createMessage).not.toHaveBeenCalled();
    expect(saveAnswer).not.toHaveBeenCalled();
  });
});
