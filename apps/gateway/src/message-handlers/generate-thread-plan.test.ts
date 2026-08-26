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
  mockEscalateToHuman,
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
  mockEscalateToHuman: vi.fn(),
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

vi.mock('./agent-thread-sink.js', () => ({
  gatewayThreadSink: {
    escalateToHuman: mockEscalateToHuman,
  },
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
    autonomyTier: 'guarded',
    autoExecuteMode: 'off',
    toolsEnabled: { action: true, communication: true, internal: true, read: true },
  })),
}));

vi.mock('../operator-context.js', () => ({
  removePendingPlanForThread: vi.fn(async () => {}),
}));

vi.mock('@shopkeeper/agent/request-outcome', () => ({
  captureCommittedPlanOutcome: vi.fn(async () => {}),
}));

vi.mock('@shopkeeper/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopkeeper/db')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      organization: {
        ...actual.db.organization,
        findUnique: vi.fn(async () => ({ name: 'Test Store', settings: {} })),
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
    channelType: 'email',
    aiSummary: 'Customer needs help',
    messages: [{ id: 'msg_1' }],
    cachedPlan: { plan: cachedPlan },
    replyIntegrationId: 'gmail_1',
    replyIntegration: {
      id: 'gmail_1',
      platform: 'email',
      emailProvider: 'gmail',
      lifecycleStatus: 'active',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
      metadata: { provider: 'gmail' },
    },
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
  mockMaybeAutoExecute.mockResolvedValue(null);
  mockEscalateToHuman.mockResolvedValue({ status: 'escalated', message: 'escalated' });
});

describe('generateThreadPlan auto-execute path', () => {
  it.each([
    {
      label: 'absent',
      replyIntegrationId: null,
      replyIntegration: null,
      reason: /no connected reply integration/i,
    },
    {
      label: 'non-active',
      replyIntegrationId: 'gmail_1',
      replyIntegration: {
        id: 'gmail_1',
        platform: 'email',
        emailProvider: 'gmail',
        lifecycleStatus: 'disconnecting',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
        metadata: { provider: 'gmail' },
      },
      reason: /reply integration is disconnected/i,
    },
    {
      label: 'provider-incomplete',
      replyIntegrationId: 'gmail_1',
      replyIntegration: {
        id: 'gmail_1',
        platform: 'email',
        emailProvider: 'gmail',
        lifecycleStatus: 'active',
        accessToken: 'access_token',
        refreshToken: null,
        tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
        metadata: { provider: 'gmail' },
      },
      reason: /needs reauthorization/i,
    },
    {
      label: 'missing an access token that is not eligible for refresh',
      replyIntegrationId: 'gmail_1',
      replyIntegration: {
        id: 'gmail_1',
        platform: 'email',
        emailProvider: 'gmail',
        lifecycleStatus: 'active',
        accessToken: null,
        refreshToken: 'refresh_token',
        tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
        metadata: { provider: 'gmail' },
      },
      reason: /needs reauthorization/i,
    },
    {
      label: 'marked for reauthorization',
      replyIntegrationId: 'gmail_1',
      replyIntegration: {
        id: 'gmail_1',
        platform: 'email',
        emailProvider: 'gmail',
        lifecycleStatus: 'active',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        tokenExpiresAt: new Date(0),
        metadata: { provider: 'gmail' },
      },
      reason: /needs reauthorization/i,
    },
  ])('refuses to plan and escalates an email thread whose reply integration is $label', async ({
    replyIntegrationId,
    replyIntegration,
    reason,
  }) => {
    mockRequireOrgThread.mockResolvedValueOnce({
      id: 'thread_1',
      channelType: 'email',
      filterStatus: 'genuine',
      cachedPlan: { plan: cachedPlan },
      cachedPlanMessageId: 'msg_1',
      replyIntegrationId,
      replyIntegration,
    });

    const result = await generateThreadPlan('org_1', 'thread_1', true);

    expect(result.plan).toBeNull();
    expect(clearThreadPlanCache).toHaveBeenCalledWith({ orgId: 'org_1', threadId: 'thread_1' });
    expect(mockEscalateToHuman).toHaveBeenCalledWith(
      { reason: expect.stringMatching(reason) },
      { orgId: 'org_1', orgName: 'Test Store', threadId: 'thread_1' },
    );
    expect(mockBuildContext).not.toHaveBeenCalled();
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(mockMaybeAutoExecute).not.toHaveBeenCalled();
  });

  it('keeps an active Postmark reply route dispatch-capable without OAuth tokens', async () => {
    mockRequireOrgThread.mockResolvedValueOnce({
      id: 'thread_1',
      channelType: 'email',
      filterStatus: 'genuine',
      cachedPlan: { plan: cachedPlan },
      cachedPlanMessageId: 'msg_1',
      replyIntegrationId: 'postmark_1',
      replyIntegration: {
        id: 'postmark_1',
        platform: 'email',
        emailProvider: 'postmark',
        lifecycleStatus: 'active',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        metadata: { provider: 'postmark' },
      },
    });

    await expect(generateThreadPlan('org_1', 'thread_1', false)).resolves.toMatchObject({
      plan: cachedPlan,
    });

    expect(mockEscalateToHuman).not.toHaveBeenCalled();
    expect(mockMaybeAutoExecute).toHaveBeenCalledOnce();
  });

  it('keeps an expired Gmail access token dispatch-capable when a refresh token is present', async () => {
    mockRequireOrgThread.mockResolvedValueOnce({
      id: 'thread_1',
      channelType: 'email',
      filterStatus: 'genuine',
      cachedPlan: { plan: cachedPlan },
      cachedPlanMessageId: 'msg_1',
      replyIntegrationId: 'gmail_1',
      replyIntegration: {
        id: 'gmail_1',
        platform: 'email',
        emailProvider: 'gmail',
        lifecycleStatus: 'active',
        accessToken: null,
        refreshToken: 'refresh_token',
        tokenExpiresAt: new Date(Date.now() - 60_000),
        metadata: { provider: 'gmail' },
      },
    });

    await expect(generateThreadPlan('org_1', 'thread_1', false)).resolves.toMatchObject({
      plan: cachedPlan,
    });

    expect(mockEscalateToHuman).not.toHaveBeenCalled();
    expect(mockMaybeAutoExecute).toHaveBeenCalledOnce();
  });

  it('does not duplicate the escalation when an unavailable email thread is already escalated', async () => {
    mockRequireOrgThread.mockResolvedValueOnce({
      id: 'thread_1',
      channelType: 'email',
      escalatedAt: new Date(),
      filterStatus: 'genuine',
      cachedPlan: null,
      cachedPlanMessageId: null,
      replyIntegrationId: null,
      replyIntegration: null,
    });

    await expect(generateThreadPlan('org_1', 'thread_1', true)).resolves.toMatchObject({ plan: null });

    expect(mockEscalateToHuman).not.toHaveBeenCalled();
    expect(mockPlanAgent).not.toHaveBeenCalled();
  });

  it('still checks the safe-reply lane when mutative auto-execute is disabled', async () => {
    const result = await generateThreadPlan('org_1', 'thread_1', false);

    expect(mockMaybeAutoExecute).toHaveBeenCalledWith(
      expect.objectContaining({ allowMutativeAutoExecute: false }),
      expect.anything(),
    );
    expect(mockBuildContext).not.toHaveBeenCalled();
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(result.autoExecuted).toBeUndefined();
    expect(result.plan).toEqual(cachedPlan);
  });

  it('auto-executes a warm cache hit when allowAutoExecute is true', async () => {
    mockMaybeAutoExecute.mockResolvedValueOnce({
      verdict: { kind: 'auto_execute' },
      result: { summary: 'Done', actionsPerformed: [] },
    });
    const result = await generateThreadPlan('org_1', 'thread_1', true);

    expect(mockMaybeAutoExecute).toHaveBeenCalledOnce();
    expect(mockBuildContext).not.toHaveBeenCalled();
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      autoExecuted: true,
      autoExecutionKind: 'action',
      autoExecutionStatus: 'success',
      autoExecutionSummary: 'Done',
    });
  });

  it('auto-executes a safe reply even when mutative auto-execute is disabled', async () => {
    mockMaybeAutoExecute.mockResolvedValueOnce({
      verdict: { kind: 'quick_reply' },
      result: { summary: 'Asked for the order number', actionsPerformed: [] },
    });

    const result = await generateThreadPlan('org_1', 'thread_1', false);

    expect(result).toMatchObject({
      autoExecuted: true,
      autoExecutionKind: 'safe_reply',
      autoExecutionStatus: 'success',
    });
  });

  it('marks failure-replan recovery so the merchant is notified once', async () => {
    mockMaybeAutoExecute.mockResolvedValueOnce({
      verdict: { kind: 'quick_reply' },
      result: {
        summary: 'Replied after the refund failed',
        actionsPerformed: [{ tool: 'send_reply', result: 'sent', status: 'success' }],
      },
      failureReplanRecovery: {
        parentResult: {
          summary: 'Refund failed',
          actionsPerformed: [
            { tool: 'add_shopify_customer_note', result: 'Noted', status: 'success' },
            { tool: 'create_refund', result: 'Rejected', status: 'error' },
          ],
        },
        parentPlan: cachedPlan,
        context: {
          parentPlanId: 'plan_parent',
          parentPlanHash: 'hash_parent',
          committedToolCallIds: ['note_1'],
          committedActions: [{ tool: 'add_shopify_customer_note', result: 'Noted' }],
          failureTool: 'create_refund',
          failureReason: 'Rejected',
        },
      },
    });

    const result = await generateThreadPlan('org_1', 'thread_1', true);

    expect(result).toMatchObject({
      autoExecuted: true,
      autoExecutionKind: 'safe_reply',
      autoExecutionStatus: 'success',
      failureReplanRecovered: true,
      failureReplanFailureTool: 'create_refund',
      failureReplanFailureReason: 'Rejected',
      autoExecutionActions: [
        { tool: 'add_shopify_customer_note', result: 'Noted' },
        { tool: 'create_refund', result: 'Rejected' },
        { tool: 'send_reply', result: 'sent' },
      ],
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
