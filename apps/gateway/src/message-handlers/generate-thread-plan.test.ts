import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMaybeAutoExecute,
  mockRequireOrgThread,
  mockBuildContext,
  mockPlanAgent,
  mockIsAgentPlanCacheHit,
  mockReadAgentPlanCache,
  mockBuildAgentPlanCacheRecord,
  mockCommitThreadPlanCacheIfCurrent,
  mockGetLatestConversationMessage,
  mockThreadUpdate,
} = vi.hoisted(() => ({
  mockMaybeAutoExecute: vi.fn(),
  mockRequireOrgThread: vi.fn(),
  mockBuildContext: vi.fn(),
  mockPlanAgent: vi.fn(),
  mockIsAgentPlanCacheHit: vi.fn(),
  mockReadAgentPlanCache: vi.fn(),
  mockBuildAgentPlanCacheRecord: vi.fn(),
  mockCommitThreadPlanCacheIfCurrent: vi.fn(),
  mockGetLatestConversationMessage: vi.fn(),
  mockThreadUpdate: vi.fn(),
}));

vi.mock('@shopkeeper/agent/thread-auth', () => ({
  requireOrgThread: mockRequireOrgThread,
  getLatestConversationMessage: mockGetLatestConversationMessage,
}));

vi.mock('@shopkeeper/agent/build-context', () => ({
  buildContext: mockBuildContext,
}));

vi.mock('@shopkeeper/agent/planner', () => ({
  planAgent: mockPlanAgent,
}));

vi.mock('@shopkeeper/agent/plan-cache', () => ({
  buildAgentPlanCacheRecord: mockBuildAgentPlanCacheRecord,
  commitThreadPlanCacheIfCurrent: mockCommitThreadPlanCacheIfCurrent,
  isAgentPlanCacheHit: mockIsAgentPlanCacheHit,
  readAgentPlanCache: mockReadAgentPlanCache,
}));

vi.mock('@shopkeeper/agent/plan-execution', () => ({
  maybeAutoExecuteCurrentCachedHomePlan: mockMaybeAutoExecute,
  findFailedToolResult: vi.fn(() => null),
  clearThreadPlanCache: vi.fn(async () => {}),
}));

vi.mock('@shopkeeper/agent/settings', () => ({
  resolveAgentSettings: vi.fn(() => ({
    autonomyMode: 'live',
    businessHours: { enabled: false },
  })),
}));

vi.mock('@shopkeeper/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopkeeper/db')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      organization: {
        ...actual.db.organization,
        findUnique: vi.fn(async () => ({ settings: {} })),
      },
      thread: {
        ...actual.db.thread,
        update: mockThreadUpdate,
      },
    },
  };
});

import { generateThreadPlan } from './generate-thread-plan.js';
import { clearThreadPlanCache } from '@shopkeeper/agent/plan-execution';
import { createDeterministicBarrier } from '@shopkeeper/agent/testing';

const cachedPlan = {
  steps: [],
  rawToolCalls: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgThread.mockResolvedValue({
    id: 'thread_1',
    aiSummary: 'Customer needs help',
    messages: [{ id: 'msg_1' }],
    cachedPlan: { plan: cachedPlan },
  });
  mockReadAgentPlanCache.mockReturnValue({ plan: cachedPlan });
  mockGetLatestConversationMessage.mockResolvedValue({ id: 'msg_1', senderType: 'customer' });
  mockBuildAgentPlanCacheRecord.mockImplementation((input) => ({
    planId: `plan_${input.lastCustomerMessageId}`,
    instruction: input.instruction,
    lastCustomerMessageId: input.lastCustomerMessageId,
    plan: input.plan,
  }));
  mockThreadUpdate.mockResolvedValue({});
  mockCommitThreadPlanCacheIfCurrent.mockResolvedValue(true);
  mockIsAgentPlanCacheHit.mockReturnValue(true);
  mockMaybeAutoExecute.mockResolvedValue({
    result: { summary: 'Done', actionsPerformed: [] },
  });
});

describe('generateThreadPlan auto-execute path', () => {
  it('skips auto-execute when allowAutoExecute is false', async () => {
    const result = await generateThreadPlan('org_1', 'thread_1', false);

    expect(mockMaybeAutoExecute).not.toHaveBeenCalled();
    expect(mockBuildContext).not.toHaveBeenCalled();
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(result.autoExecuted).toBeUndefined();
    expect(result.plan).toEqual(cachedPlan);
  });

  it('auto-executes a warm cache hit when allowAutoExecute is true', async () => {
    const result = await generateThreadPlan('org_1', 'thread_1', true);

    expect(mockMaybeAutoExecute).toHaveBeenCalledOnce();
    expect(mockBuildContext).not.toHaveBeenCalled();
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      autoExecuted: true,
      autoExecutionStatus: 'success',
      autoExecutionSummary: 'Done',
    });
  });

  it('skips auto-execute on an escalated thread even when allowAutoExecute is true (P5-04)', async () => {
    mockRequireOrgThread.mockResolvedValueOnce({
      id: 'thread_1',
      aiSummary: 'Customer needs help',
      escalatedAt: new Date(),
      messages: [{ id: 'msg_1' }],
      cachedPlan: { plan: cachedPlan },
    });

    const result = await generateThreadPlan('org_1', 'thread_1', true);

    // The plan is still surfaced for the merchant — the agent just never
    // autonomously acts on a ticket flagged for a human.
    expect(mockMaybeAutoExecute).not.toHaveBeenCalled();
    expect(result.autoExecuted).toBeUndefined();
    expect(result.plan).toEqual(cachedPlan);
  });

  it('uses an instruction override instead of aiSummary when provided', async () => {
    mockIsAgentPlanCacheHit.mockReturnValue(false);
    mockRequireOrgThread.mockResolvedValueOnce({
      id: 'thread_1',
      aiSummary: 'Summarized request',
      filterStatus: 'genuine',
      messages: [{ id: 'msg_1' }],
      cachedPlan: null,
    });
    mockBuildContext.mockResolvedValue({ thread: { id: 'thread_1' } });
    mockPlanAgent.mockResolvedValue({
      steps: [{ id: 'send_1', tool: 'send_reply' }],
      rawToolCalls: [{ id: 'send_1', name: 'send_reply', input: { text: 'Hi' } }],
    });

    const result = await generateThreadPlan('org_1', 'thread_1', false, {
      instruction: 'Where is my order #1001?',
    });

    expect(mockPlanAgent).toHaveBeenCalledWith(
      expect.anything(),
      'Where is my order #1001?',
      expect.anything(),
    );
    expect(result.instruction).toBe('Where is my order #1001?');
  });

  it('skips plan generation for questionable senders and clears stale cache', async () => {
    mockRequireOrgThread.mockResolvedValueOnce({
      id: 'thread_1',
      aiSummary: 'Customer needs help',
      filterStatus: 'questionable',
      cachedPlan: { plan: cachedPlan },
      cachedPlanMessageId: 'msg_1',
    });

    const result = await generateThreadPlan('org_1', 'thread_1', true);

    expect(clearThreadPlanCache).toHaveBeenCalledWith({ orgId: 'org_1', threadId: 'thread_1' });
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(mockMaybeAutoExecute).not.toHaveBeenCalled();
    expect(result.plan).toBeNull();
  });

  it('skips a summary job whose source message has already been superseded', async () => {
    mockGetLatestConversationMessage.mockResolvedValueOnce({ id: 'msg_new', senderType: 'customer' });

    const result = await generateThreadPlan('org_1', 'thread_1', true, {
      sourceMessageId: 'msg_old',
    });

    expect(result.plan).toBeNull();
    expect(mockBuildContext).not.toHaveBeenCalled();
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(mockMaybeAutoExecute).not.toHaveBeenCalled();
  });

  it('discards an older planner after a newer customer message wins the cache commit', async () => {
    const oldPlannerBarrier = createDeterministicBarrier(1);
    const oldPlan = {
      steps: [{ id: 'old_send', tool: 'send_reply' }],
      rawToolCalls: [{ id: 'old_send', name: 'send_reply', input: { text: 'Old reply' } }],
    };
    const newPlan = {
      steps: [{ id: 'new_send', tool: 'send_reply' }],
      rawToolCalls: [{ id: 'new_send', name: 'send_reply', input: { text: 'New reply' } }],
    };
    mockIsAgentPlanCacheHit.mockReturnValue(false);
    mockReadAgentPlanCache.mockReturnValue(null);
    mockRequireOrgThread.mockResolvedValue({
      id: 'thread_1',
      aiSummary: 'Customer needs help',
      filterStatus: 'genuine',
      cachedPlan: null,
      cachedPlanMessageId: null,
    });
    mockBuildContext.mockResolvedValue({ thread: { id: 'thread_1' } });
    mockGetLatestConversationMessage
      .mockResolvedValueOnce({ id: 'msg_old', senderType: 'customer' })
      .mockResolvedValueOnce({ id: 'msg_new', senderType: 'customer' });
    mockPlanAgent
      .mockImplementationOnce(async () => {
        await oldPlannerBarrier.arrive();
        return oldPlan;
      })
      .mockResolvedValueOnce(newPlan);
    mockCommitThreadPlanCacheIfCurrent.mockImplementation(async ({ sourceMessageId }) => (
      sourceMessageId === 'msg_new'
    ));

    const oldRun = generateThreadPlan('org_1', 'thread_1', false);
    await oldPlannerBarrier.waitForArrivals();
    await generateThreadPlan('org_1', 'thread_1', false);
    oldPlannerBarrier.release();
    const staleResult = await oldRun;

    expect(mockCommitThreadPlanCacheIfCurrent).toHaveBeenCalledTimes(2);
    expect(mockCommitThreadPlanCacheIfCurrent.mock.calls[0]?.[0]).toMatchObject({
      sourceMessageId: 'msg_new',
    });
    expect(mockCommitThreadPlanCacheIfCurrent.mock.calls[1]?.[0]).toMatchObject({
      sourceMessageId: 'msg_old',
    });
    expect(staleResult.plan).toBeNull();
  });
});
