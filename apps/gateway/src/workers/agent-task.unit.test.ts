import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  claim, renew, settle, fail, reserve, recordUsage, runTurn, findRequest, findMember,
  getContext, loadContext,
} = vi.hoisted(() => ({
  claim: vi.fn(),
  renew: vi.fn(),
  settle: vi.fn(),
  fail: vi.fn(),
  reserve: vi.fn(),
  recordUsage: vi.fn(),
  runTurn: vi.fn(),
  findRequest: vi.fn(),
  findMember: vi.fn(),
  getContext: vi.fn(),
  loadContext: vi.fn(),
}));

vi.mock('@shopkeeper/agent/task-ledger', () => ({
  claimAgentTask: claim,
  renewAgentTaskLease: renew,
  settleAgentTaskClaim: settle,
  failAgentTaskClaim: fail,
  reserveAgentTaskModelCall: reserve,
  recordAgentTaskModelUsage: recordUsage,
}));
vi.mock('@shopkeeper/db', () => ({
  db: {
    agentRequest: { findFirst: findRequest },
    orgMember: { findFirst: findMember },
  },
}));
vi.mock('../operator-context.js', () => ({
  getContext, loadLiveOperatorContext: loadContext,
  normalizeApprovedToolCalls: (calls: { id: string; name: string; input: unknown }[]) =>
    calls.map(({ id, name, input }) => ({ id, name, input })),
}));
vi.mock('../message-handlers/operator/operator-free-form-turn.js', () => ({ runOperatorFreeFormTurn: runTurn }));
vi.mock('../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { processAgentTaskJob } from './agent-task.js';

const job = { taskId: 'task-1', organizationId: 'org-1', revision: 0 };
const task = { id: 'task-1', initiatingActorKey: 'member:member-1' };
const request = { id: 'request-1', normalizedInstruction: 'check order' };
const IDLE_CONTEXT = { pendingPlans: [], pendingPlan: null, pendingQuestion: null };

describe('processAgentTaskJob', () => {
  beforeEach(() => {
    claim.mockReset().mockResolvedValue({ task, claimToken: 'claim-1' });
    renew.mockReset().mockResolvedValue(true);
    settle.mockReset().mockResolvedValue(true);
    fail.mockReset().mockResolvedValue('failed');
    findRequest.mockReset().mockResolvedValue(request);
    findMember.mockReset().mockResolvedValue({ clerkUserId: 'usr-1' });
    reserve.mockReset().mockResolvedValue('active');
    recordUsage.mockReset().mockResolvedValue(true);
    getContext.mockReset().mockResolvedValue(IDLE_CONTEXT);
    loadContext.mockReset().mockResolvedValue(IDLE_CONTEXT);
    runTurn.mockReset().mockResolvedValue({ summary: 'Done', actionsPerformed: [] });
  });

  it('does nothing when queue redelivery loses the durable claim', async () => {
    claim.mockResolvedValue(null);
    await processAgentTaskJob(job);
    expect(runTurn).not.toHaveBeenCalled();
  });

  it('runs the persisted instruction and settles the exact claim', async () => {
    await processAgentTaskJob(job);
    expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1', clerkUserId: 'usr-1',
      requestId: 'request-1', taskId: 'task-1',
      message: expect.objectContaining({ body: 'check order' }),
    }));
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'request-1', taskId: 'task-1', claimToken: 'claim-1',
      settlement: { status: 'completed' },
    }));
  });

  it('resumes a continued task from the answer, not the instruction that asked', async () => {
    await processAgentTaskJob(job);
    expect(findRequest).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
    }));
  });

  it('settles a parked question as the durable wait, naming the question', async () => {
    getContext.mockResolvedValue({
      ...IDLE_CONTEXT,
      pendingQuestion: { threadId: 'thread-1', question: 'Refund shipping too?' },
    });
    await processAgentTaskJob(job);
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({
      settlement: { status: 'waiting_input', question: 'Refund shipping too?' },
    }));
  });

  it('settles a parked plan as the durable proposal the merchant must approve', async () => {
    const plan = {
      threadId: 'thread-1', instruction: 'refund the order',
      rawToolCalls: [{ id: 'call-1', name: 'refund_order', input: { orderId: '55' } }],
    };
    getContext.mockResolvedValue({ ...IDLE_CONTEXT, pendingPlans: [plan], pendingPlan: plan });
    await processAgentTaskJob(job);
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({
      settlement: {
        status: 'waiting_approval',
        proposal: {
          instruction: 'refund the order',
          rawToolCalls: [{ id: 'call-1', name: 'refund_order', input: { orderId: '55' } }],
          sourceRequestIds: ['request-1'],
        },
      },
    }));
  });

  it('hands the turn a budget that stops the loop when the task was stopped', async () => {
    await processAgentTaskJob(job);
    const { taskBudget } = runTurn.mock.calls[0][0];
    await expect(taskBudget.reserveModelCall()).resolves.toBeUndefined();
    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1', claimToken: 'claim-1' }));
    reserve.mockResolvedValue('cancelled');
    await expect(taskBudget.reserveModelCall()).rejects.toThrow('cancelled');
    await taskBudget.recordModelUsage(
      { inputTokens: 10, outputTokens: 5, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      'claude-sonnet-5',
    );
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      usage: expect.objectContaining({ inputTokens: 10, outputTokens: 5 }),
    }));
  });

  it('records a failed attempt without asking BullMQ to replay it', async () => {
    runTurn.mockRejectedValue(new Error('provider response lost'));
    await processAgentTaskJob(job);
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'request-1', taskId: 'task-1', claimToken: 'claim-1',
    }));
  });

  it('keeps a task reconciling when a provider or delivery outcome is unknown', async () => {
    runTurn.mockResolvedValue({
      summary: 'I could not confirm whether the operation completed.',
      actionsPerformed: [{
        tool: 'create_shopify_order',
        result: 'Unknown provider result',
        status: 'unknown',
      }],
    });

    await processAgentTaskJob(job);

    expect(settle).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'request-1',
      taskId: 'task-1',
      claimToken: 'claim-1',
      settlement: {
        status: 'reconciling',
        failureCode: 'unknown_provider_outcome',
      },
    }));
  });

  it('does not park later work over an operation whose outcome is unknown', async () => {
    runTurn.mockResolvedValue({
      summary: 'The send may have completed.',
      actionsPerformed: [{
        tool: 'send_ticket_reply',
        result: 'Unknown delivery result',
        status: 'unknown',
      }],
    });
    getContext.mockResolvedValue({
      ...IDLE_CONTEXT,
      pendingQuestion: { threadId: 'thread-1', question: 'Try again?' },
    });

    await processAgentTaskJob(job);

    expect(settle).toHaveBeenCalledWith(expect.objectContaining({
      settlement: {
        status: 'reconciling',
        failureCode: 'unknown_provider_outcome',
      },
    }));
  });
});
