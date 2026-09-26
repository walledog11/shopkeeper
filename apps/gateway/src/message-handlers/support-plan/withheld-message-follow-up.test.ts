import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { createTestMessage } from '@shopkeeper/db/test-helpers';
import { executeCurrentCachedHomePlan, type PlanExecutionDeps } from '@shopkeeper/agent/plan-execution';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { AgentPlan, RawToolCall } from '@shopkeeper/agent/types';
import type { AgentResult } from '@shopkeeper/agent/context';
import {
  agentPlanFromRawToolCalls,
  seedGuardedRefundSupportThread,
  stubDurableAgentRuntimeEnv,
} from '../../test-fixtures/support-plan-test-fixtures.js';
import { createTestOrgTracker } from '../../test-fixtures/test-org-tracker.js';

const { mockPlanAgent, mockSendPlan, mockSendQuestion } = vi.hoisted(() => ({
  mockPlanAgent: vi.fn(),
  mockSendPlan: vi.fn(async (..._args: unknown[]) => {}),
  mockSendQuestion: vi.fn(async () => {}),
}));

// Only the model, the context it reads and the outbound pushes are stood in for.
// The approval, the execution ledger, the task transitions and the plan cache are
// the real ones: what this file asserts is what the durable rows end up saying.
vi.mock('@shopkeeper/agent/build-context', () => ({ buildContext: vi.fn(async () => ({})) }));
vi.mock('@shopkeeper/agent/planner', async (importOriginal) => ({
  ...await importOriginal<typeof import('@shopkeeper/agent/planner')>(),
  planAgent: mockPlanAgent,
}));
vi.mock('@shopkeeper/agent/request-outcome', async (importOriginal) => ({
  ...await importOriginal<typeof import('@shopkeeper/agent/request-outcome')>(),
  captureCommittedPlanOutcome: vi.fn(async () => {}),
}));
vi.mock('../../realtime/publish.js', () => ({ publishThreadEvent: vi.fn(async () => {}) }));
vi.mock('../../product-analytics.js', () => ({ captureAgentPlanGenerated: vi.fn(async () => {}) }));
vi.mock('./planning-notifications.js', () => ({
  sendOperatorPlanNotification: mockSendPlan,
  sendOperatorQuestionNotification: mockSendQuestion,
}));

import { generateThreadPlan } from './generate-thread-plan.js';
import { processAgentTaskJob } from '../../workers/agent-task.js';

const refund: RawToolCall = {
  id: 'refund', name: 'create_refund',
  input: { order_id: '1', amount: '10.00', reason: 'requested' },
};
const reply: RawToolCall = { id: 'reply', name: 'send_reply', input: { text: 'Your refund is on its way.' } };
const followUpReply: RawToolCall = {
  id: 'follow_up', name: 'send_reply',
  input: { text: "We couldn't process the refund just now. We'll be in touch shortly." },
};

const testOrgs = createTestOrgTracker();

function exactDraftPlan(threadId: string, calls: RawToolCall[], draft: RawToolCall): AgentPlan {
  return agentPlanFromRawToolCalls(calls, {
    communication: {
      mode: 'exact_draft',
      destination: { kind: 'thread', id: threadId, channel: 'ig_dm' },
      draft: (draft.input as { text: string }).text,
      allowedResultBindings: [],
    },
  });
}

function approvalDeps(actionsPerformed: AgentResult['actionsPerformed']): PlanExecutionDeps {
  return {
    lock: { acquire: async () => ({ release: async () => undefined }) },
    buildContext: async () => ({}) as never,
    runAgent: async () => ({ summary: 'ran', actionsPerformed }),
  };
}

// A real v2 card on a real support task, approved by a bound member, with the
// refund declined at the provider: execution stops there and the approved
// message is never attempted.
async function approveCardWhoseRefundFails() {
  const seed = await seedGuardedRefundSupportThread();
  testOrgs.track(seed.organizationId);
  mockPlanAgent.mockResolvedValueOnce(exactDraftPlan(seed.threadId, [refund, reply], reply));
  await generateThreadPlan(seed.organizationId, seed.threadId, false);
  const member = await db.orgMember.create({
    data: { organizationId: seed.organizationId, clerkUserId: randomUUID() },
  });
  await executeCurrentCachedHomePlan({
    orgId: seed.organizationId,
    threadId: seed.threadId,
    settings: resolveAgentSettings({ autonomyTier: 'guarded', autoExecuteMode: 'off', maxRefundAmount: 100 }),
    executionIntent: 'merchant_approved',
    failureRoute: 'test',
    approver: { clerkUserId: member.clerkUserId, displayName: null },
  }, approvalDeps([{ tool: 'create_refund', result: 'Error: refund declined', status: 'error' }]));
  const task = await db.agentTask.findFirstOrThrow({ where: { organizationId: seed.organizationId } });
  expect(task.status).toBe('queued');
  return { seed, task };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubDurableAgentRuntimeEnv();
});
afterEach(async () => {
  await testOrgs.cleanupAll();
  vi.unstubAllEnvs();
});

describe('withheld-message follow-up', () => {
  it('parks a message-only draft of what happened and pushes its card', async () => {
    const { seed, task } = await approveCardWhoseRefundFails();
    // The signal the real planner attaches under `withheldMessageFollowUp`
    // (planner.test.ts); without it a reply-only plan is a quick reply.
    mockPlanAgent.mockResolvedValueOnce({
      ...exactDraftPlan(seed.threadId, [followUpReply], followUpReply),
      signals: [{ code: 'approved_message_withheld', severity: 'blocking', message: 'Not sent.' }],
    });

    await processAgentTaskJob({ organizationId: seed.organizationId, taskId: task.id, revision: task.revision });

    const [, instruction, , options] = mockPlanAgent.mock.calls.at(-1)!;
    expect(options).toMatchObject({ withheldMessageFollowUp: true, exactDraftProposal: true, runtimeVersion: 2 });
    expect(instruction).toContain('The message was not sent');

    const parked = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(parked).toMatchObject({ status: 'waiting_approval', claimToken: null });
    const proposal = await db.agentProposal.findUniqueOrThrow({ where: { id: parked.activeProposalId! } });
    expect(proposal).toMatchObject({ status: 'ready', canonicalActions: [followUpReply] });

    const thread = await db.thread.findUniqueOrThrow({ where: { id: seed.threadId } });
    expect((thread.cachedPlan as { planId?: string }).planId).toBe(proposal.id);
    expect(mockSendPlan).toHaveBeenCalledTimes(1);
    expect(mockSendPlan.mock.calls[0]?.[7]).toMatchObject({
      identity: { planId: proposal.id, sourceMessageId: seed.messageId },
    });
  });

  it('ends the task as its execution did when the customer has written again', async () => {
    const { seed, task } = await approveCardWhoseRefundFails();
    await createTestMessage(seed.threadId, 'Any update on my refund?');

    await processAgentTaskJob({ organizationId: seed.organizationId, taskId: task.id, revision: task.revision });

    expect(mockPlanAgent).toHaveBeenCalledTimes(1);
    expect(mockSendPlan).not.toHaveBeenCalled();
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({ status: 'failed', failureCode: 'approved_execution_failed', claimToken: null });
  });
});
