import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  ChannelType,
  CUSTOMER_MEMORY_VERSION,
  KEY_FACTS_MAX,
  KEY_FACT_MAX_CHARS,
  OUTCOME_MAX_CHARS,
  RECENT_INTERACTIONS_MAX,
  SUMMARY_MAX_CHARS,
  db,
  type CustomerMemory,
} from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
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
    await db.customer.update({
      where: { id: customer.id },
      data: {
        memory: json({
          summary: '   ',
          keyFacts: [],
          policyFlags: { vip: false },
          recentInteractions: [],
          version: CUSTOMER_MEMORY_VERSION,
        }),
      },
    });

    const ctx = await buildContext(thread.id, org.id);

    expect(ctx.customerMemory).toBeNull();
  });

  it('returns null for malformed stored customer memory', async () => {
    const customer = await createTestCustomer(org.id, 'malformed-memory-context@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await createTestMessage(thread.id, 'Hello');
    await db.customer.update({
      where: { id: customer.id },
      data: {
        memory: json({
          summary: 123,
          keyFacts: [42, null],
          policyFlags: {
            vip: 'true',
            complaintPattern: 'yes',
            priorRefundsTotal: '1000',
            priorRefundsCount: -1,
          },
          recentInteractions: [
            {
              threadId: 'thread_bad',
              channel: 'email',
              tag: 'Support',
              closedAt: '2026-05-20T12:00:00.000Z',
              outcome: 42,
            },
          ],
          version: 99,
        }),
      },
    });

    const ctx = await buildContext(thread.id, org.id);

    expect(ctx.customerMemory).toBeNull();
  });

  it('bounds oversized stored customer memory before loading agent context', async () => {
    const customer = await createTestCustomer(org.id, 'oversized-memory-context@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await createTestMessage(thread.id, 'Hello');
    const longFact = 'f'.repeat(KEY_FACT_MAX_CHARS + 1);
    const longTag = 't'.repeat(OUTCOME_MAX_CHARS + 50);
    const longClosedAt = 'c'.repeat(OUTCOME_MAX_CHARS + 50);
    const longOutcome = 'o'.repeat(OUTCOME_MAX_CHARS + 50);
    const recentInteractions = Array.from({ length: RECENT_INTERACTIONS_MAX + 3 }, (_, index) => ({
      threadId: `thread_${index}`,
      channel: 'email',
      tag: index === 0 ? longTag : 'Shipping',
      closedAt: index === 0 ? longClosedAt : '2026-05-20T12:00:00.000Z',
      outcome: index === 0 ? longOutcome : `Resolved issue ${index}.`,
    }));

    await db.customer.update({
      where: { id: customer.id },
      data: {
        memory: json({
          summary: 's'.repeat(SUMMARY_MAX_CHARS + 50),
          keyFacts: [
            ...Array.from({ length: KEY_FACTS_MAX + 3 }, (_, index) => `Fact ${index}`),
            longFact,
          ],
          policyFlags: {
            vip: 'yes',
            complaintPattern: true,
            priorRefundsTotal: -1,
            priorRefundsCount: 3,
            extraFlag: true,
          },
          recentInteractions,
          version: 99,
        }),
      },
    });

    const ctx = await buildContext(thread.id, org.id);

    expect(ctx.customerMemory).not.toBeNull();
    if (!ctx.customerMemory) throw new Error('Expected customer memory');
    expect(ctx.customerMemory.summary).toHaveLength(SUMMARY_MAX_CHARS);
    expect(ctx.customerMemory.keyFacts).toHaveLength(KEY_FACTS_MAX);
    expect(ctx.customerMemory.keyFacts).not.toContain(longFact);
    expect(ctx.customerMemory.policyFlags).toEqual({ complaintPattern: true, priorRefundsCount: 3 });
    expect(ctx.customerMemory.recentInteractions).toHaveLength(RECENT_INTERACTIONS_MAX);
    expect(ctx.customerMemory.recentInteractions[0]).toMatchObject({
      tag: longTag.slice(0, OUTCOME_MAX_CHARS),
      closedAt: longClosedAt.slice(0, OUTCOME_MAX_CHARS),
      outcome: longOutcome.slice(0, OUTCOME_MAX_CHARS),
    });
    expect(ctx.customerMemory.version).toBe(CUSTOMER_MEMORY_VERSION);
  });
});
