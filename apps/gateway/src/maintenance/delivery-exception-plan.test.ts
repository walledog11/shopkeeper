import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import {
  buildDeliveryExceptionInstruction,
  findOpenThreadForShopifyCustomer,
  pushDeliveryExceptionApprovalPlan,
  resolveDeliveryExceptionThread,
} from './delivery-exception-plan.js';

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

describe('buildDeliveryExceptionInstruction', () => {
  it('asks for a proactive heads-up on stalled shipments', () => {
    expect(buildDeliveryExceptionInstruction({
      orderId: '1001',
      trackingNumber: '9400',
      issueType: 'stalled',
      issueSummary: null,
    })).toContain('stalled in transit');
  });
});

describe('findOpenThreadForShopifyCustomer', () => {
  it('finds an open thread by thread.shopifyCustomerId', async () => {
    const customer = await createTestCustomer(org.id, 'sarah@example.com', { name: 'Sarah Jones' });
    const thread = await createTestThread(org.id, customer.id, 'email', {
      shopifyCustomerId: 'gid://shopify/Customer/55',
    });

    await expect(findOpenThreadForShopifyCustomer(org.id, 'gid://shopify/Customer/55'))
      .resolves.toBe(thread.id);
  });
});

describe('resolveDeliveryExceptionThread', () => {
  it('creates an email thread when no open ticket exists yet', async () => {
    const threadId = await resolveDeliveryExceptionThread({
      organizationId: org.id,
      shopifyCustomerId: 'gid://shopify/Customer/77',
      customerEmail: 'newcustomer@example.com',
      customerName: 'New Customer',
      orderId: '1001',
    });

    expect(threadId).toBeTruthy();
    await expect(findOpenThreadForShopifyCustomer(org.id, 'gid://shopify/Customer/77'))
      .resolves.toBe(threadId);
  });
});

describe('pushDeliveryExceptionApprovalPlan', () => {
  it('pushes a plan through the approval loop when planning succeeds', async () => {
    const customer = await createTestCustomer(org.id, 'sarah@example.com', { name: 'Sarah Jones' });
    const thread = await createTestThread(org.id, customer.id, 'email', {
      shopifyCustomerId: 'gid://shopify/Customer/55',
    });
    await createTestMessage(thread.id, 'Where is my order?');

    generateThreadPlanSpy.mockResolvedValue({
      plan: {
        instruction: 'heads-up',
        steps: [{ id: '1', tool: 'send_reply', label: 'Reply', description: 'Reply', category: 'communication', enabled: true }],
        rawToolCalls: [{ id: '1', name: 'send_reply', input: { message: 'We are on it.' } }],
      },
      instruction: 'Delivery exception',
      identity: {
        planId: '11111111-1111-4111-8111-111111111111',
        sourceMessageId: '22222222-2222-4222-8222-222222222222',
        planHash: 'abc',
        instructionHash: 'def',
      },
    });

    const outcome = await pushDeliveryExceptionApprovalPlan(org.id, {
      id: 'watch-1',
      threadId: thread.id,
      orderId: '1001',
      trackingNumber: '9400',
      trackingCompany: 'USPS',
      issueType: 'exception',
      issueSummary: 'Return to Sender',
      customerName: 'Sarah Jones',
    });

    expect(outcome).toBe('plan_pushed');
    expect(generateThreadPlanSpy).toHaveBeenCalledWith(org.id, thread.id, false, expect.objectContaining({
      instruction: expect.stringContaining('delivery exception'),
    }));
    expect(sendOperatorPlanNotificationSpy).toHaveBeenCalled();
  });

  it('falls back to notify-only when there is no thread', async () => {
    const outcome = await pushDeliveryExceptionApprovalPlan(org.id, {
      id: 'watch-2',
      threadId: null,
      orderId: '1001',
      trackingNumber: '9401',
      trackingCompany: 'USPS',
      issueType: 'stalled',
      issueSummary: null,
      customerName: 'Sarah Jones',
    });

    expect(outcome).toBe('notify_only');
    expect(generateThreadPlanSpy).not.toHaveBeenCalled();
    expect(sendOperatorPlanNotificationSpy).not.toHaveBeenCalled();
  });
});
