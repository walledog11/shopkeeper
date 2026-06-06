import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CUSTOMER_MEMORY_VERSION,
  EMPTY_MEMORY,
  KEY_FACTS_MAX,
  SUMMARY_MAX_CHARS,
  db,
  type CustomerMemory,
} from '@clerk/db';
import { cleanupTestData, createTestCustomer, createTestOrg } from '@clerk/db/test-helpers';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

import { GET, PATCH } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(async () => {
  org = await createTestOrg();
  mockAuth.mockResolvedValue({ userId: 'usr_customer_memory', orgId: org.clerkOrgId });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  org = null;
  otherOrg = null;
  vi.clearAllMocks();
});

describe('/api/customers/[id]/memory', () => {
  it('returns the current customer memory scoped to the active org', async () => {
    const customer = await createTestCustomer(org!.id, 'memory-get@test.com');
    const savedMemory = memory({
      summary: 'Prefers email updates.',
      keyFacts: ['Asked about delayed shipping'],
      policyFlags: { vip: true },
    });
    await db.customer.update({
      where: { id: customer.id },
      data: { memory: savedMemory, memoryUpdatedAt: new Date('2026-05-26T12:00:00.000Z') },
    });

    const res = await GET(undefined, params(customer.id));
    const body = await res.json() as { memory: CustomerMemory; memoryUpdatedAt: string | null };

    expect(res.status).toBe(200);
    expect(body.memory).toMatchObject(savedMemory);
    expect(body.memoryUpdatedAt).toBe('2026-05-26T12:00:00.000Z');
  });

  it('returns 404 for another org customer', async () => {
    otherOrg = await createTestOrg();
    const foreignCustomer = await createTestCustomer(otherOrg.id, 'memory-foreign@test.com');

    const res = await GET(undefined, params(foreignCustomer.id));

    expect(res.status).toBe(404);
  });

  it('updates editable fields, preserves derived fields, and bumps memoryUpdatedAt', async () => {
    const customer = await createTestCustomer(org!.id, 'memory-patch@test.com');
    const existing = memory({
      summary: 'Old summary.',
      keyFacts: ['Old fact'],
      policyFlags: { complaintPattern: true, priorRefundsCount: 3 },
      recentInteractions: [
        {
          threadId: 'thread-1',
          channel: 'email',
          tag: 'shipping',
          closedAt: '2026-05-24T10:00:00.000Z',
          outcome: 'Asked about a late package.',
        },
      ],
    });
    await db.customer.update({ where: { id: customer.id }, data: { memory: existing } });

    const res = await PATCH(
      jsonRequest(`http://localhost/api/customers/${customer.id}/memory`, {
        summary: ' New summary. ',
        keyFacts: [' First fact ', '', 'Second fact'],
        policyFlags: { vip: true },
        recentInteractions: [],
      }, 'PATCH'),
      params(customer.id),
    );
    const body = await res.json() as { memory: CustomerMemory; memoryUpdatedAt: string | null };

    expect(res.status).toBe(200);
    expect(body.memory.summary).toBe('New summary.');
    expect(body.memory.keyFacts).toEqual(['First fact', 'Second fact']);
    expect(body.memory.policyFlags).toEqual(existing.policyFlags);
    expect(body.memory.recentInteractions).toEqual(existing.recentInteractions);
    expect(body.memoryUpdatedAt).toEqual(expect.any(String));

    const saved = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    const savedMemory = saved.memory as unknown as CustomerMemory;
    expect(savedMemory.summary).toBe('New summary.');
    expect(savedMemory.policyFlags).toEqual(existing.policyFlags);
    expect(saved.memoryUpdatedAt).toBeInstanceOf(Date);
  });

  it('bounds persisted memory through the shared contract', async () => {
    const customer = await createTestCustomer(org!.id, 'memory-bound@test.com');
    const tooManyFacts = Array.from({ length: KEY_FACTS_MAX + 3 }, (_, index) => `fact ${index}`);

    const res = await PATCH(
      jsonRequest(`http://localhost/api/customers/${customer.id}/memory`, {
        summary: 'a'.repeat(SUMMARY_MAX_CHARS + 25),
        keyFacts: tooManyFacts,
      }, 'PATCH'),
      params(customer.id),
    );
    const body = await res.json() as { memory: CustomerMemory };

    expect(res.status).toBe(200);
    expect(body.memory.summary).toHaveLength(SUMMARY_MAX_CHARS);
    expect(body.memory.keyFacts).toHaveLength(KEY_FACTS_MAX);
  });

  it('does not bump memoryUpdatedAt when the submitted values are unchanged', async () => {
    const customer = await createTestCustomer(org!.id, 'memory-noop@test.com');
    const stored = memory({ summary: 'Stable.', keyFacts: ['One', 'Two'] });
    const storedAt = new Date('2026-05-20T12:00:00.000Z');
    await db.customer.update({
      where: { id: customer.id },
      data: { memory: stored, memoryUpdatedAt: storedAt },
    });

    const res = await PATCH(
      jsonRequest(`http://localhost/api/customers/${customer.id}/memory`, {
        summary: 'Stable.',
        keyFacts: ['One', 'Two'],
      }, 'PATCH'),
      params(customer.id),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { memoryUpdatedAt: string | null };
    expect(body.memoryUpdatedAt).toBe(storedAt.toISOString());

    const persisted = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(persisted.memoryUpdatedAt?.getTime()).toBe(storedAt.getTime());
  });

  it('rejects malformed JSON without updating customer memory', async () => {
    const customer = await createTestCustomer(org!.id, 'memory-malformed@test.com');
    const stored = memory({ summary: 'Keep me.' });
    await db.customer.update({
      where: { id: customer.id },
      data: { memory: stored },
    });

    const res = await PATCH(
      rawRequest(`http://localhost/api/customers/${customer.id}/memory`, '{', 'PATCH'),
      params(customer.id),
    );

    expect(res.status).toBe(400);
    const unchanged = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect((unchanged.memory as unknown as CustomerMemory).summary).toBe('Keep me.');
  });

  it('rejects invalid keyFacts without mutating the customer', async () => {
    const customer = await createTestCustomer(org!.id, 'memory-invalid@test.com');
    await db.customer.update({
      where: { id: customer.id },
      data: { memory: memory({ summary: 'Keep me.' }) },
    });

    const res = await PATCH(
      jsonRequest(`http://localhost/api/customers/${customer.id}/memory`, { keyFacts: ['ok', 42] }, 'PATCH'),
      params(customer.id),
    );

    expect(res.status).toBe(400);
    const unchanged = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect((unchanged.memory as unknown as CustomerMemory).summary).toBe('Keep me.');
  });
});

function memory(overrides: Partial<CustomerMemory> = {}): CustomerMemory {
  return {
    ...EMPTY_MEMORY,
    ...overrides,
    keyFacts: overrides.keyFacts ?? EMPTY_MEMORY.keyFacts,
    policyFlags: overrides.policyFlags ?? EMPTY_MEMORY.policyFlags,
    recentInteractions: overrides.recentInteractions ?? EMPTY_MEMORY.recentInteractions,
    version: CUSTOMER_MEMORY_VERSION,
  };
}

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawRequest(url: string, body: string, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
