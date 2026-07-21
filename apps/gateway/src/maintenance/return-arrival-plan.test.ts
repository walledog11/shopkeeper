import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { buildReturnArrivalInstruction } from './return-arrival-plan.js';

const { generateThreadPlanSpy, sendOperatorPlanNotificationSpy, listOperatorBindingsSpy } = vi.hoisted(() => ({
  generateThreadPlanSpy: vi.fn(),
  sendOperatorPlanNotificationSpy: vi.fn(),
  listOperatorBindingsSpy: vi.fn(),
}));

vi.mock('../message-handlers/generate-thread-plan.js', () => ({
  generateThreadPlan: generateThreadPlanSpy,
}));

vi.mock('../message-handlers/planning-notifications.js', () => ({
  sendOperatorPlanNotification: sendOperatorPlanNotificationSpy,
}));

vi.mock('../operator-notify.js', () => ({
  listOperatorBindings: listOperatorBindingsSpy,
  notifyOperator: vi.fn().mockResolvedValue(true),
}));

import { pushReturnArrivalApprovalPlan } from './return-arrival-plan.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  generateThreadPlanSpy.mockReset();
  sendOperatorPlanNotificationSpy.mockReset();
  listOperatorBindingsSpy.mockReset();
  listOperatorBindingsSpy.mockResolvedValue([{ clerkUserId: 'user_1', channel: 'telegram', contextKey: '1' }]);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('buildReturnArrivalInstruction', () => {
  it('asks for a refund after a return arrives', () => {
    expect(buildReturnArrivalInstruction({
      orderId: '1001',
      returnName: '#R12',
      tool: 'create_return',
    })).toContain('Issue the refund');
  });

  it('asks to process an exchange after the return arrives', () => {
    expect(buildReturnArrivalInstruction({
      orderId: '1001',
      returnName: '#R12',
      tool: 'create_exchange',
    })).toContain('Process the exchange');
  });
});

describe('pushReturnArrivalApprovalPlan', () => {
  it('pushes a plan through the approval loop when planning succeeds', async () => {
    const customer = await createTestCustomer(org.id, 'sarah@example.com', { name: 'Sarah Jones' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    await createTestMessage(thread.id, 'I want to return this hoodie');

    generateThreadPlanSpy.mockResolvedValue({
      plan: {
        instruction: 'refund',
        steps: [{ id: '1', tool: 'create_refund', label: 'Refund', description: 'Refund', category: 'action', enabled: true }],
        rawToolCalls: [{ id: '1', name: 'create_refund', input: { order_id: '1001', amount: '42.00' } }],
      },
      instruction: 'Return arrived',
      identity: {
        planId: '11111111-1111-4111-8111-111111111111',
        sourceMessageId: '22222222-2222-4222-8222-222222222222',
        planHash: 'abc',
        instructionHash: 'def',
      },
    });

    const outcome = await pushReturnArrivalApprovalPlan(org.id, {
      id: 'watch-1',
      threadId: thread.id,
      orderId: '1001',
      shopifyReturnId: 'gid://shopify/Return/9',
      returnName: '#R12',
      tool: 'create_return',
      customerName: 'Sarah Jones',
    });

    expect(outcome).toBe('plan_pushed');
    expect(generateThreadPlanSpy).toHaveBeenCalledWith(org.id, thread.id, false, expect.objectContaining({
      instruction: expect.stringContaining('arrived back at the warehouse'),
    }));
    expect(sendOperatorPlanNotificationSpy).toHaveBeenCalled();
  });

  it('falls back to notify-only when there is no thread', async () => {
    const outcome = await pushReturnArrivalApprovalPlan(org.id, {
      id: 'watch-2',
      threadId: null,
      orderId: '1001',
      shopifyReturnId: 'gid://shopify/Return/10',
      returnName: '#R13',
      tool: 'create_return',
      customerName: 'Sarah Jones',
    });

    expect(outcome).toBe('notify_only');
    expect(generateThreadPlanSpy).not.toHaveBeenCalled();
    expect(sendOperatorPlanNotificationSpy).not.toHaveBeenCalled();
  });
});
