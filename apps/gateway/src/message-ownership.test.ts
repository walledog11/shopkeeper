import { afterEach, describe, expect, it } from 'vitest';
import { ChannelType, SenderType, createMessage, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

const orgIds: string[] = [];

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

async function seedThread() {
  const org = await createTestOrg();
  orgIds.push(org.id);
  const customer = await createTestCustomer(org.id, `${crypto.randomUUID()}@example.com`);
  const thread = await createTestThread(org.id, customer.id, ChannelType.email);
  return { org, thread };
}

describe('createMessage tenant ownership', () => {
  it('derives the organization from the thread when the caller omits it', async () => {
    const { org, thread } = await seedThread();

    const message = await createMessage({
      threadId: thread.id,
      senderType: SenderType.agent,
      contentText: 'Owned message',
    });

    expect(message.organizationId).toBe(org.id);
  });

  it('rejects an explicit organization that does not own the thread', async () => {
    const first = await seedThread();
    const second = await seedThread();

    await expect(createMessage({
      threadId: second.thread.id,
      organizationId: first.org.id,
      senderType: SenderType.agent,
      contentText: 'Cross-tenant message',
    })).rejects.toThrow('Message organization does not match its thread organization.');

    await expect(db.message.count({
      where: { threadId: second.thread.id, contentText: 'Cross-tenant message' },
    })).resolves.toBe(0);
  });
});
