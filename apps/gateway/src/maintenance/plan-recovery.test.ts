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
  it('classifies a follow-up the classifier never reached before planning it', async () => {
    const organization = await createTestOrg();
    organizationId = organization.id;
    const customer = await createTestCustomer(organization.id, 'visitor-session-42');
    const thread = await createTestThread(organization.id, customer.id, 'shopify_chat');
    const earlier = await createTestMessage(thread.id, 'Hi there');
    await db.message.update({
      where: { id: earlier.id },
      data: { sentAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000) },
    });
    const message = await createTestMessage(thread.id, 'Where is my order?');
    // The thread's verdict is for the earlier message, not this one.
    await db.thread.update({
      where: { id: thread.id },
      data: {
        filterDecidedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        requestSourceMessageId: earlier.id,
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
      }),
      expect.anything(),
    );
    expect(add.mock.calls[0]?.[1]).not.toHaveProperty('skipSummary');
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
