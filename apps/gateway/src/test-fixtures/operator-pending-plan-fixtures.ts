import { db } from '@shopkeeper/db';
import {
  createTestCustomer,
  createTestMessage,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { updateContext, type PendingPlan } from '../operator-context.js';

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
  const plan: PendingPlan = {
    threadId: thread.id,
    planId: '11111111-1111-4111-8111-111111111111',
    sourceMessageId: source.id,
    instruction: 'Answer the product question',
    customerName: 'Sarah Jones',
    rawToolCalls: [{
      id: 'reply',
      name: 'send_reply',
      input: { text: 'The lavender candle is made with soy wax and contains no paraffin.' },
    }],
  };
  await updateContext(orgId, memberKey, { pendingPlan: plan });
  return plan;
}
