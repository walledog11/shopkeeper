import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findThread: vi.fn(),
  findOrganization: vi.fn(),
  latestConversation: vi.fn(),
  intelligence: vi.fn(),
  precompute: vi.fn(),
  autoAck: vi.fn(),
  autoNotification: vi.fn(),
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
  requireOrgThread: vi.fn(),
}));

vi.mock('@shopkeeper/agent/settings', () => ({
  resolveAgentSettings: vi.fn(() => ({ autoPlanOnOpen: true })),
  isWithinBusinessHours: mocks.withinBusinessHours,
}));

vi.mock('./intelligence.js', () => ({ generateThreadIntelligence: mocks.intelligence }));
vi.mock('./planning.js', () => ({
  precomputeThreadPlan: mocks.precompute,
  sendAutoAck: mocks.autoAck,
}));
vi.mock('./planning-notifications.js', () => ({
  sendOperatorAutoExecutionNotification: mocks.autoNotification,
  sendOperatorPlanNotification: mocks.planNotification,
  sendOperatorQuestionNotification: mocks.questionNotification,
}));

import { processAiSummaryJob } from './ai-summary-flow.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findThread.mockResolvedValue({
    channelType: 'email',
    filterDecidedAt: null,
    filterStatus: 'genuine',
  });
  mocks.findOrganization.mockResolvedValue({ settings: {} });
  mocks.latestConversation.mockResolvedValue({ id: 'message_1', senderType: 'customer' });
  mocks.intelligence.mockResolvedValue({ filterStatus: 'genuine', aiSummary: 'Needs an order lookup.' });
  mocks.withinBusinessHours.mockReturnValue(false);
});

describe('processAiSummaryJob safe replies', () => {
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
