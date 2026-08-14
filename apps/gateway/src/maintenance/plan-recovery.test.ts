import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { recoverMissingPlans } from './plan-recovery.js';

const NOW = new Date('2026-08-13T16:00:00.000Z');
let organizationId: string | undefined;

afterEach(async () => {
  await cleanupTestData(organizationId);
  organizationId = undefined;
});

describe('recoverMissingPlans', () => {
  it('finds a genuine pending customer message with no plan and enqueues it once', async () => {
    const organization = await createTestOrg();
    organizationId = organization.id;
    const customer = await createTestCustomer(organization.id, 'visitor-session-42');
    const thread = await createTestThread(organization.id, customer.id, 'shopify_chat');
    const message = await createTestMessage(thread.id, 'Where is my order?');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        filterDecidedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        lastMessageSenderType: 'customer',
        updatedAt: new Date(NOW.getTime() - 10 * 60 * 1000),
      },
    });
    const add = vi.fn().mockResolvedValue({});

    await recoverMissingPlans({ add }, NOW);
    expect(add).toHaveBeenCalledWith(
      'summarize-thread',
      expect.objectContaining({
        threadId: thread.id,
        organizationId: organization.id,
        sourceMessageId: message.id,
        skipSummary: true,
      }),
      expect.anything(),
    );
  });

  it('leaves an answered thread out of recovery', async () => {
    const organization = await createTestOrg();
    organizationId = organization.id;
    const customer = await createTestCustomer(organization.id, 'visitor-session-43');
    const thread = await createTestThread(organization.id, customer.id, 'shopify_chat');
    await createTestMessage(thread.id, 'Where is my order?');
    await createTestMessage(thread.id, 'Could you share your order number?', 'agent');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        lastMessageSenderType: 'agent',
        updatedAt: new Date(NOW.getTime() - 10 * 60 * 1000),
      },
    });
    const add = vi.fn();

    await recoverMissingPlans({ add }, NOW);
    const recoveredThreadIds = add.mock.calls.map((call) => call[1]?.threadId);
    expect(recoveredThreadIds).not.toContain(thread.id);
  });
});
