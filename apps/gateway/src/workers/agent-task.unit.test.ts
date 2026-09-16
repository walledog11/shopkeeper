import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  claim, renew, settle, fail, runTurn, findRequest, findMember,
  findUsage, getContext, loadContext,
} = vi.hoisted(() => ({
  claim: vi.fn(),
  renew: vi.fn(),
  settle: vi.fn(),
  fail: vi.fn(),
  runTurn: vi.fn(),
  findRequest: vi.fn(),
  findMember: vi.fn(),
  findUsage: vi.fn(),
  getContext: vi.fn(),
  loadContext: vi.fn(),
}));

vi.mock('@shopkeeper/agent/task-ledger', () => ({
  claimAgentTask: claim,
  renewAgentTaskLease: renew,
  settleAgentTaskClaim: settle,
  failAgentTaskClaim: fail,
}));
vi.mock('@shopkeeper/db', () => ({
  db: {
    agentRequest: { findFirst: findRequest },
    orgMember: { findFirst: findMember },
    agentTurnUsage: { findUnique: findUsage },
  },
}));
vi.mock('../operator-context.js', () => ({ getContext, loadLiveOperatorContext: loadContext }));
vi.mock('../message-handlers/operator-free-form-turn.js', () => ({ runOperatorFreeFormTurn: runTurn }));
vi.mock('../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { processAgentTaskJob } from './agent-task.js';

const job = { taskId: 'task-1', organizationId: 'org-1', revision: 0 };
const task = { id: 'task-1', initiatingActorKey: 'member:member-1' };
const request = { id: 'request-1', normalizedInstruction: 'check order' };

describe('processAgentTaskJob', () => {
  beforeEach(() => {
    claim.mockReset().mockResolvedValue({ task, claimToken: 'claim-1' });
    renew.mockReset().mockResolvedValue(true);
    settle.mockReset().mockResolvedValue(true);
    fail.mockReset().mockResolvedValue('failed');
    findRequest.mockReset().mockResolvedValue(request);
    findMember.mockReset().mockResolvedValue({ clerkUserId: 'usr-1' });
    findUsage.mockReset().mockResolvedValue(null);
    getContext.mockReset().mockResolvedValue({ pendingPlans: [], pendingQuestion: null });
    loadContext.mockReset().mockResolvedValue({ pendingPlans: [], pendingQuestion: null });
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
      requestId: 'request-1', taskId: 'task-1', claimToken: 'claim-1', status: 'completed',
    }));
  });

  it('records a failed attempt without asking BullMQ to replay it', async () => {
    runTurn.mockRejectedValue(new Error('provider response lost'));
    await processAgentTaskJob(job);
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'request-1', taskId: 'task-1', claimToken: 'claim-1',
    }));
  });
});
