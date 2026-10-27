import { db } from '@shopkeeper/db';
import {
  createTestCustomer,
  createTestMessage,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { normalizeApprovedToolCalls, updateContext, type PendingPlan } from '../operator-context.js';
import { agentPlanFromRawToolCalls } from './support-plan-test-fixtures.js';

export function pendingPlanFor(
  threadId: string,
  planId: string,
  overrides: Partial<PendingPlan> = {},
): PendingPlan {
  return {
    threadId,
    instruction: `handle ${threadId}`,
    rawToolCalls: [{ id: `tc-${planId}`, name: 'create_refund' }],
    planId,
    ...overrides,
  };
}

/**
 * Parks a plan the way planning does: it becomes the thread's cached plan for
 * its source message, and the card carries that plan's identity. Anything else
 * is a card the live queue and the briefing drop.
 */
export async function parkCurrentPlan(
  orgId: string,
  memberKey: string,
  plan: PendingPlan & { planId: string },
  sourceMessageId: string,
): Promise<PendingPlan> {
  const record = buildAgentPlanCacheRecord({
    instruction: plan.instruction,
    lastCustomerMessageId: sourceMessageId,
    settings: resolveAgentSettings(null),
    plan: { ...agentPlanFromRawToolCalls(normalizeApprovedToolCalls(plan.rawToolCalls)), instruction: plan.instruction },
  });
  const cache = { ...record, planId: plan.planId };
  await db.thread.update({
    where: { id: plan.threadId },
    data: { cachedPlan: cache as object, cachedPlanMessageId: sourceMessageId },
  });
  const parked: PendingPlan = {
    ...plan,
    sourceMessageId,
    planHash: hashPlan(cache.plan),
    instructionHash: hashInstruction(plan.instruction),
  };
  await updateContext(orgId, memberKey, { pendingPlan: parked });
  return parked;
}

/** Sarah / paraffin question — used by digest ledger and pending-plan selection tests. */
export async function seedSarahReplyPendingPlan(
  orgId: string,
  memberKey = 'member-test',
): Promise<PendingPlan> {
  const customer = await createTestCustomer(orgId, 'sarah@example.com', { name: 'Sarah Jones' });
  const thread = await createTestThread(orgId, customer.id, 'email');
  const source = await createTestMessage(thread.id, 'Does the lavender candle contain paraffin?');
  await db.thread.update({
    where: { id: thread.id },
    data: { requestSourceMessageId: source.id },
  });
  return parkCurrentPlan(orgId, memberKey, {
    threadId: thread.id,
    planId: '11111111-1111-4111-8111-111111111111',
    instruction: 'Answer the product question',
    customerName: 'Sarah Jones',
    rawToolCalls: [{
      id: 'reply',
      name: 'send_reply',
      input: { text: 'The lavender candle is made with soy wax and contains no paraffin.' },
    }],
  }, source.id);
}
