import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMaybeAutoExecute,
  mockRequireOrgThread,
  mockBuildContext,
  mockPlanAgent,
  mockIsAgentPlanCacheHit,
  mockReadAgentPlanCache,
} = vi.hoisted(() => ({
  mockMaybeAutoExecute: vi.fn(),
  mockRequireOrgThread: vi.fn(),
  mockBuildContext: vi.fn(),
  mockPlanAgent: vi.fn(),
  mockIsAgentPlanCacheHit: vi.fn(),
  mockReadAgentPlanCache: vi.fn(),
}));

vi.mock('@shopkeeper/agent/thread-auth', () => ({
  requireOrgThread: mockRequireOrgThread,
  getLatestConversationMessage: vi.fn(async () => ({ id: 'msg_1', senderType: 'customer' })),
}));

vi.mock('@shopkeeper/agent/build-context', () => ({
  buildContext: mockBuildContext,
}));

vi.mock('@shopkeeper/agent/planner', () => ({
  planAgent: mockPlanAgent,
}));

vi.mock('@shopkeeper/agent/plan-cache', () => ({
  buildAgentPlanCacheRecord: vi.fn(() => ({ cached: true })),
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
        update: vi.fn(async () => ({})),
      },
    },
  };
});

import { generateThreadPlan } from './generate-thread-plan.js';
import { clearThreadPlanCache } from '@shopkeeper/agent/plan-execution';

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
});
