import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestCustomer, createTestMessage, createTestOrg, createTestThread } from '@shopkeeper/db/test-helpers';
import { ANY_MEMBER_ACTOR_KEY, acceptCustomerAgentRequest, claimAgentTask, settleAgentTaskClaim } from '@shopkeeper/agent/task-ledger';
import { readAgentPlanCache } from '@shopkeeper/agent/plan-cache';
import type { AgentPlan } from '@shopkeeper/agent/types';
import { auth } from '@clerk/nextjs/server';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), clerkClient: vi.fn() }));
const { planAgent } = vi.hoisted(() => ({ planAgent: vi.fn() }));
vi.mock('@/lib/agent/runner', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/agent/runner')>(), planAgent,
}));
import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let member: Awaited<ReturnType<typeof db.orgMember.create>>;
const budget = { runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 300000, spendNanoUsdLimit: BigInt(1000000000) };
function replyPlan(threadId: string): AgentPlan {
  return {
    instruction: 'Return request', warnings: [],
    steps: [{ id: 'reply', tool: 'send_reply', category: 'communication', label: 'Reply', description: 'Reply', enabled: true }],
    rawToolCalls: [{ id: 'reply', name: 'send_reply', input: { text: 'We can accept the return.' } }],
    communication: {
      mode: 'exact_draft', destination: { kind: 'thread', id: threadId, channel: 'email' },
      draft: 'We can accept the return.', allowedResultBindings: [],
    },
  };
}
beforeEach(async () => {
  org = await createTestOrg();
  member = await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: randomUUID() } });
  vi.mocked(auth).mockResolvedValue({ userId: member.clerkUserId, orgId: org.clerkOrgId } as Awaited<ReturnType<typeof auth>>);
  planAgent.mockReset();
});
afterEach(async () => { await cleanupTestData(org.id); });

async function seedWaitingTask() {
  const customer = await createTestCustomer(org.id, 'dashboard-answer@example.com');
  const thread = await createTestThread(org.id, customer.id, 'email');
  const message = await createTestMessage(thread.id, 'Can I return this?', 'customer');
  await db.thread.update({ where: { id: thread.id }, data: { requestSummary: 'Return request' } });
  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: org.id, threadId: thread.id, sourceMessageId: message.id, objective: 'Return request', budget,
  });
  const claim = await claimAgentTask({ organizationId: org.id, taskId: task.id, expectedRevision: task.revision });
  await settleAgentTaskClaim({
    organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
    claimToken: claim!.claimToken, requestId: request.id,
    settlement: { status: 'waiting_input', question: 'Should I accept the return?', answerer: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY } },
  });
  return { thread, message, task };
}
function answerRequest(threadId: string) {
  return new Request('http://localhost:3000/api/agent/answer', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, answer: 'Yes, accept it.', saveToKb: false }),
  });
}
describe('dashboard answer continuation', () => {
  it.each(['budget', 'cancelled', 'claim_lost', 'new_customer_message'] as const)(
    'refuses publication after %s', async reason => {
      const { thread, task } = await seedWaitingTask();
      if (reason === 'budget') {
        await db.agentTask.update({ where: { id: task.id }, data: { modelCallsUsed: budget.modelCallLimit } });
      }
      planAgent.mockImplementation(async ctx => {
        await ctx.taskBudget.reserveModelCall();
        if (reason === 'cancelled') {
          await db.agentTask.update({ where: { id: task.id }, data: { cancelledAt: new Date() } });
        } else if (reason === 'claim_lost') {
          await db.agentTask.update({ where: { id: task.id }, data: { claimToken: randomUUID() } });
        } else if (reason === 'new_customer_message') {
          await createTestMessage(thread.id, 'Actually, cancel the return.', 'customer');
        }
        return replyPlan(thread.id);
      });
      const result = await POST(answerRequest(thread.id));
      expect(result.status).toBe(409);
      expect((await db.thread.findUniqueOrThrow({ where: { id: thread.id } })).cachedPlan).toBeNull();
      expect(await db.agentProposal.count({ where: { taskId: task.id } })).toBe(0);
    },
  );

  it('commits a receipt-bound proposal with the original customer source and cumulative usage', async () => {
    const { thread, message, task } = await seedWaitingTask();
    await db.agentTask.update({ where: { id: task.id }, data: { modelCallsUsed: 2, inputTokensUsed: 10, outputTokensUsed: 5 } });
    planAgent.mockImplementation(async ctx => {
      await ctx.taskBudget.reserveModelCall();
      await ctx.taskBudget.recordModelUsage({ inputTokens: 20, outputTokens: 8, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }, 'claude-haiku-4-5-20251001');
      return { ...replyPlan(thread.id), instruction: 'Expanded merchant answer planning context' };
    });
    expect((await POST(answerRequest(thread.id))).status).toBe(200);
    const settled = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    const cached = readAgentPlanCache((await db.thread.findUniqueOrThrow({ where: { id: thread.id } })).cachedPlan)!;
    expect(settled).toMatchObject({ status: 'waiting_approval', activeProposalId: cached.planId, modelCallsUsed: 3, inputTokensUsed: 30, outputTokensUsed: 13 });
    const proposal = await db.agentProposal.findUniqueOrThrow({ where: { id: cached.planId! } });
    const source = await db.agentRequest.findUniqueOrThrow({ where: { id: (proposal.sourceRequestIds as string[])[0] } });
    expect(source).toMatchObject({ sourceMessageId: message.id, actorKind: 'member', taskId: task.id });
  });
});
