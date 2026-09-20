import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@shopkeeper/db';
import {
  cleanupTestData, createTestCustomer, createTestMessage, createTestOrg, createTestThread,
} from '@shopkeeper/db/test-helpers';
import { ANY_MEMBER_ACTOR_KEY } from '@shopkeeper/agent/task-ledger';
import { TOOL_CATEGORIES } from '@shopkeeper/agent/tools';
import type { AgentPlan, RawToolCall } from '@shopkeeper/agent/types';

const { mockPlanAgent, mockBuildContext, mockMaybeAutoExecute } = vi.hoisted(() => ({
  mockPlanAgent: vi.fn(),
  mockBuildContext: vi.fn(async () => ({})),
  mockMaybeAutoExecute: vi.fn<(params: { durableTurn?: { requestId: string; taskId: string } }) => Promise<unknown>>(),
}));

// Only the model and the provider are stood in for. The thread, the message, the
// plan cache, the autonomy verdict and the whole task ledger are the real ones,
// because what this file asserts is what the durable rows end up saying.
vi.mock('@shopkeeper/agent/build-context', () => ({ buildContext: mockBuildContext }));
vi.mock('@shopkeeper/agent/planner', async (importOriginal) => ({
  ...await importOriginal<typeof import('@shopkeeper/agent/planner')>(),
  planAgent: mockPlanAgent,
}));
vi.mock('@shopkeeper/agent/plan-execution', async (importOriginal) => ({
  ...await importOriginal<typeof import('@shopkeeper/agent/plan-execution')>(),
  maybeAutoExecuteCurrentCachedHomePlan: mockMaybeAutoExecute,
}));
vi.mock('@shopkeeper/agent/request-outcome', () => ({
  captureCommittedPlanOutcome: vi.fn(async () => {}),
}));
vi.mock('../realtime/publish.js', () => ({ publishThreadEvent: vi.fn(async () => {}) }));
vi.mock('../product-analytics.js', () => ({ captureAgentPlanGenerated: vi.fn(async () => {}) }));
vi.mock('../operator-context.js', () => ({ removePendingPlanForThread: vi.fn(async () => {}) }));

import { generateThreadPlan } from './generate-thread-plan.js';

const refund: RawToolCall = {
  id: 'refund', name: 'create_refund',
  input: { order_id: '1', amount: '10.00', reason: 'requested' },
};
const reply: RawToolCall = { id: 'reply', name: 'send_reply', input: { text: 'Refunded.' } };

function plan(calls: RawToolCall[], overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    instruction: 'Handle this customer\'s latest request',
    rawToolCalls: calls,
    steps: calls
      .filter(call => TOOL_CATEGORIES[call.name] !== 'read')
      .map(call => ({
        id: call.id, tool: call.name, label: call.name,
        description: call.name, category: TOOL_CATEGORIES[call.name] ?? 'internal',
        enabled: true,
      })),
    validation: { status: 'valid', issues: [] },
    routingEvidence: { classifierState: 'aligned', codes: [] },
    ...overrides,
  };
}

const orgIds: string[] = [];

async function seedThread() {
  const org = await createTestOrg();
  orgIds.push(org.id);
  await db.organization.update({
    where: { id: org.id },
    // Guarded: a refund is the merchant's to approve, never auto-executed.
    data: { settings: { autonomyTier: 'guarded', autoExecuteMode: 'off', maxRefundAmount: 100 } },
  });
  const customer = await createTestCustomer(org.id, randomUUID());
  const thread = await createTestThread(org.id, customer.id, 'ig_dm');
  const message = await createTestMessage(thread.id, 'Can I get a refund?');
  return { organizationId: org.id, threadId: thread.id, customerId: customer.id, messageId: message.id };
}

function taskFor(organizationId: string) {
  return db.agentTask.findFirstOrThrow({
    where: { organizationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMaybeAutoExecute.mockResolvedValue(null);
});
afterEach(async () => {
  for (const id of orgIds.splice(0)) await cleanupTestData(id);
});

describe('durable support task', () => {
  it('records the customer message as a request and parks the proposal on its task', async () => {
    const seed = await seedThread();
    mockPlanAgent.mockResolvedValue(plan([refund, reply]));

    const generated = await generateThreadPlan(seed.organizationId, seed.threadId, false);
    expect(generated.plan).not.toBeNull();

    const request = await db.agentRequest.findFirstOrThrow({
      where: { organizationId: seed.organizationId },
    });
    expect(request).toMatchObject({
      actorKind: 'customer', actorKey: `customer:${seed.customerId}`, channel: 'ig_dm',
      dedupeKey: seed.messageId, sourceMessageId: seed.messageId, state: 'attached',
      normalizedInstruction: 'Can I get a refund?',
    });

    const task = await taskFor(seed.organizationId);
    expect(task).toMatchObject({
      status: 'waiting_approval', initiatingActorKind: 'customer',
      claimToken: null, leaseExpiresAt: null,
    });
    expect(task.activeProposalId).not.toBeNull();

    // The proposal is the card: its ID is the plan ID the merchant approves by,
    // and it holds the calls that approval authorizes.
    const proposal = await db.agentProposal.findFirstOrThrow({
      where: { id: task.activeProposalId! },
    });
    expect(proposal.id).toBe(generated.identity?.planId);
    expect(proposal.canonicalActions).toEqual([refund, reply]);
    expect(proposal.sourceRequestIds).toEqual([request.id]);
    // The card is pushed to every bound operator, so the wait names them all.
    // Left to the task's initiator it would name the customer, and the approval
    // boundary would refuse every merchant who tried to act on the card.
    expect(proposal).toMatchObject({
      approverScopeKind: 'member', approverScopeKey: ANY_MEMBER_ACTOR_KEY,
    });
  });

  it('settles a plan with nothing to approve as done', async () => {
    const seed = await seedThread();
    mockPlanAgent.mockResolvedValue(plan([
      { id: 'esc', name: 'escalate_to_human', input: { reason: 'Needs a human' } },
    ]));

    await generateThreadPlan(seed.organizationId, seed.threadId, false);

    const task = await taskFor(seed.organizationId);
    expect(task.status).toBe('completed');
    expect(task.completedAt).not.toBeNull();
    expect(task.activeProposalId).toBeNull();
    expect(await db.agentProposal.count({ where: { organizationId: seed.organizationId } })).toBe(0);
  });

  it('parks a merchant question on the members who can answer it', async () => {
    const seed = await seedThread();
    mockPlanAgent.mockResolvedValue(plan([
      { id: 'ask', name: 'ask_operator', input: { question: 'Do we refund past 30 days?' } },
    ]));

    await generateThreadPlan(seed.organizationId, seed.threadId, false);

    expect(await taskFor(seed.organizationId)).toMatchObject({
      status: 'waiting_input',
      pendingQuestion: 'Do we refund past 30 days?',
      // The customer initiated the task; the merchant answers it.
      pendingAnswererKind: 'member',
      pendingAnswererKey: ANY_MEMBER_ACTOR_KEY,
    });
  });

  it('supersedes the parked proposal when the customer writes again', async () => {
    const seed = await seedThread();
    mockPlanAgent.mockResolvedValue(plan([refund, reply]));
    await generateThreadPlan(seed.organizationId, seed.threadId, false);
    const first = await taskFor(seed.organizationId);

    await createTestMessage(seed.threadId, 'Actually, just cancel it');
    mockPlanAgent.mockResolvedValue(plan([
      { id: 'cancel', name: 'cancel_order', input: { order_id: '1', reason: 'customer' } },
      reply,
    ]));
    await generateThreadPlan(seed.organizationId, seed.threadId, false);

    const second = await taskFor(seed.organizationId);
    expect(second.id).toBe(first.id);
    expect(second.revision).toBe(1);
    expect(second.activeProposalId).not.toBe(first.activeProposalId);
    expect(await db.agentTask.count({ where: { organizationId: seed.organizationId } })).toBe(1);
    expect(await db.agentRequest.count({ where: { organizationId: seed.organizationId } })).toBe(2);
  });

  it('records the attempt as failed without swallowing the failure', async () => {
    const seed = await seedThread();
    mockPlanAgent.mockRejectedValue(new Error('planner exploded'));

    await expect(generateThreadPlan(seed.organizationId, seed.threadId, false))
      .rejects.toThrow('planner exploded');

    expect(await taskFor(seed.organizationId)).toMatchObject({
      status: 'failed', failureCode: 'plan_attempt_failed', claimToken: null,
    });
  });

  it('leaves the second job for one message to report the same plan untracked', async () => {
    const seed = await seedThread();
    mockPlanAgent.mockResolvedValue(plan([refund, reply]));
    await generateThreadPlan(seed.organizationId, seed.threadId, false);
    const parked = await taskFor(seed.organizationId);

    const again = await generateThreadPlan(seed.organizationId, seed.threadId, false);

    expect(again.plan).not.toBeNull();
    expect(mockPlanAgent).toHaveBeenCalledTimes(1);
    expect(await db.agentRequest.count({ where: { organizationId: seed.organizationId } })).toBe(1);
    expect(await db.agentTask.count({ where: { organizationId: seed.organizationId } })).toBe(1);
    // The wait the merchant is in is not ended by replanning the same message.
    expect(await taskFor(seed.organizationId)).toMatchObject({
      status: 'waiting_approval', revision: parked.revision,
      activeProposalId: parked.activeProposalId,
    });
  });

  // What the durable turn is for: the rows an execution writes name the request,
  // so settling the task can claim them without a second identity to keep in step.
  it('links what the execution recorded to the task that authorized it', async () => {
    const seed = await seedThread();
    mockPlanAgent.mockResolvedValue(plan([reply]));
    mockMaybeAutoExecute.mockImplementation(async (params) => {
      const turnId = params.durableTurn!.requestId;
      await db.agentAction.create({ data: {
        organizationId: seed.organizationId, threadId: seed.threadId, turnId,
        tool: 'send_reply', category: 'communication', input: { text: 'Refunded.' },
        status: 'success', mode: 'auto_executed', output: 'sent',
        executedAt: new Date(), durationMs: 5,
      } });
      return {
        verdict: { kind: 'quick_reply' }, instruction: 'Handle it',
        result: { summary: 'Replied.', actionsPerformed: [] },
      };
    });

    await generateThreadPlan(seed.organizationId, seed.threadId, true);

    const task = await taskFor(seed.organizationId);
    expect(task.status).toBe('completed');
    const action = await db.agentAction.findFirstOrThrow({
      where: { organizationId: seed.organizationId },
    });
    expect(action.taskId).toBe(task.id);
    expect(action.turnId).toBe((await db.agentRequest.findFirstOrThrow({
      where: { organizationId: seed.organizationId },
    })).id);
  });

  it('names the request on the execution of the plan it authorized', async () => {
    const seed = await seedThread();
    mockPlanAgent.mockResolvedValue(plan([reply]));
    mockMaybeAutoExecute.mockImplementation(async (params) => {
      expect(params.durableTurn).toMatchObject({
        requestId: (await db.agentRequest.findFirstOrThrow({
          where: { organizationId: seed.organizationId },
        })).id,
        taskId: (await taskFor(seed.organizationId)).id,
      });
      return null;
    });

    await generateThreadPlan(seed.organizationId, seed.threadId, true);
    expect(mockMaybeAutoExecute).toHaveBeenCalledTimes(1);
  });
});
