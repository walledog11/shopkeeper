import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildContext,
  clearPlan,
  createMessage,
  findThread,
  getLatest,
  getOrg,
  planAgent,
  requireThread,
  saveAnswer,
  threadUpdate,
} = vi.hoisted(() => ({
  buildContext: vi.fn(),
  clearPlan: vi.fn(),
  createMessage: vi.fn(),
  findThread: vi.fn(),
  getLatest: vi.fn(),
  getOrg: vi.fn(),
  planAgent: vi.fn(),
  requireThread: vi.fn(),
  saveAnswer: vi.fn(),
  threadUpdate: vi.fn(),
}));

vi.mock('@shopkeeper/db', async (importOriginal) => ({
  ...await importOriginal<typeof import('@shopkeeper/db')>(),
  db: { thread: { findUnique: findThread, update: threadUpdate } },
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
vi.mock('@shopkeeper/agent/plan-preview', () => ({
  classifyHomePlan: vi.fn(() => ({
    kind: 'approval_required',
    question: null,
    replyText: 'Shipping is $15.',
  })),
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
  });

  it('validates the answer before any persistence', async () => {
    const response = await POST(request({ answer: '   ' }));

    expect(response.status).toBe(400);
    expect(createMessage).not.toHaveBeenCalled();
    expect(saveAnswer).not.toHaveBeenCalled();
  });
});
