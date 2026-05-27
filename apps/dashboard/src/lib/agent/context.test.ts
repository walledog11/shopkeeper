import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ChannelType, db, type CustomerMemory } from '@clerk/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@clerk/db/test-helpers';
import { buildContext } from './context';

function memory(overrides: Partial<CustomerMemory> = {}): CustomerMemory {
  return {
    summary: 'Customer prefers proactive shipping updates.',
    keyFacts: ['VIP since 2024', 'Prefers email updates'],
    policyFlags: { vip: true },
    recentInteractions: [{
      threadId: 'thread_previous',
      channel: 'email',
      tag: 'Shipping',
      closedAt: '2026-05-20T12:00:00.000Z',
      outcome: 'Resolved a delayed shipment question.',
    }],
    version: 1,
    ...overrides,
  };
}

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('buildContext customer memory', () => {
  it('loads populated customer memory into the agent context', async () => {
    const customer = await createTestCustomer(org.id, 'memory-context@example.com', { name: 'Memory Context' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await createTestMessage(thread.id, 'Can I get an update?');

    const customerMemory = memory();
    await db.customer.update({
      where: { id: customer.id },
      data: {
        memory: json(customerMemory),
        memoryUpdatedAt: new Date('2026-05-26T12:00:00.000Z'),
      },
    });

    const ctx = await buildContext(thread.id, org.id);

    expect(ctx.customerMemory).toEqual(customerMemory);
  });

  it('returns null for empty customer memory', async () => {
    const customer = await createTestCustomer(org.id, 'empty-memory-context@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await createTestMessage(thread.id, 'Hello');

    const ctx = await buildContext(thread.id, org.id);

    expect(ctx.customerMemory).toBeNull();
  });
});
