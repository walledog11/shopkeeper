import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, SenderType, SpendCapError, db, type CustomerMemory } from '@clerk/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@clerk/db/test-helpers';

const { mockSummarizeCustomerMemory, mockCaptureException, mockLogger } = vi.hoisted(() => ({
  mockSummarizeCustomerMemory: vi.fn(),
  mockCaptureException: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const { mockEnforceSpendCap } = vi.hoisted(() => ({
  mockEnforceSpendCap: vi.fn(),
}));

vi.mock('./customer-memory-summarizer.js', () => ({
  summarizeCustomerMemory: mockSummarizeCustomerMemory,
}));

vi.mock('@sentry/node', () => ({
  captureException: mockCaptureException,
}));

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../llm-spend.js', () => ({
  enforceSpendCap: mockEnforceSpendCap,
}));

import { refreshStaleCustomerMemory, updateCustomerMemoryOnThreadClose } from './customer-memory.js';

function memory(overrides: Partial<CustomerMemory> = {}): CustomerMemory {
  return {
    summary: 'Customer prefers clear shipping updates.',
    keyFacts: ['Prefers email updates'],
    policyFlags: {},
    recentInteractions: [],
    version: 1,
    ...overrides,
  };
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  mockSummarizeCustomerMemory.mockReset();
  mockEnforceSpendCap.mockReset().mockResolvedValue(undefined);
  mockCaptureException.mockReset();
  mockLogger.debug.mockClear();
  mockLogger.error.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('updateCustomerMemoryOnThreadClose', () => {
  it('summarizes a closed thread, writes bounded memory, and skips duplicate close jobs', async () => {
    const customer = await createTestCustomer(org.id, 'memory-close@example.com', { name: 'Memory Close' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await createTestMessage(thread.id, 'My package is late.', SenderType.customer);
    await createTestMessage(thread.id, 'We sent the tracking link.', SenderType.agent);
    const closedThread = await db.thread.update({
      where: { id: thread.id },
      data: { status: 'closed', aiSummary: 'Customer asked about a delayed shipment.', tag: 'Shipping' },
    });

    mockSummarizeCustomerMemory.mockResolvedValueOnce(memory({
      recentInteractions: [{
        threadId: thread.id,
        channel: 'email',
        tag: 'Shipping',
        closedAt: closedThread.updatedAt.toISOString(),
        outcome: 'Resolved delayed shipment question.',
      }],
    }));

    await updateCustomerMemoryOnThreadClose(thread.id);

    const updated = await db.customer.findUnique({
      where: { id: customer.id },
      select: { memory: true, memoryUpdatedAt: true },
    });
    expect(updated?.memoryUpdatedAt).toBeInstanceOf(Date);
    expect(updated?.memory).toMatchObject({
      summary: 'Customer prefers clear shipping updates.',
      keyFacts: ['Prefers email updates'],
      recentInteractions: [expect.objectContaining({ threadId: thread.id, outcome: 'Resolved delayed shipment question.' })],
      version: 1,
    });
    expect(mockSummarizeCustomerMemory).toHaveBeenCalledTimes(1);

    await updateCustomerMemoryOnThreadClose(thread.id);
    expect(mockSummarizeCustomerMemory).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows summarizer failures', async () => {
    const customer = await createTestCustomer(org.id, 'memory-error@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { status: 'closed' } });

    const error = new Error('Claude unavailable');
    mockSummarizeCustomerMemory.mockRejectedValueOnce(error);

    await expect(updateCustomerMemoryOnThreadClose(thread.id)).resolves.toBeUndefined();

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      extra: { threadId: thread.id, component: 'customer_memory' },
    });
  });

  it('skips when the queued organization id does not match the thread', async () => {
    const customer = await createTestCustomer(org.id, 'memory-wrong-org@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { status: 'closed' } });

    await updateCustomerMemoryOnThreadClose(thread.id, {
      organizationId: '00000000-0000-0000-0000-000000000000',
    });

    expect(mockSummarizeCustomerMemory).not.toHaveBeenCalled();
  });
});

describe('refreshStaleCustomerMemory', () => {
  it('refreshes stale customers from their latest recent closed thread and is a no-op once fresh', async () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    const customer = await createTestCustomer(org.id, 'memory-stale@example.com');
    await db.customer.update({
      where: { id: customer.id },
      data: { memoryUpdatedAt: daysAgo(now, 31) },
    });

    const olderThread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({
      where: { id: olderThread.id },
      data: {
        status: 'closed',
        updatedAt: daysAgo(now, 10),
        aiSummary: 'Older closed thread.',
      },
    });

    const latestThread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({
      where: { id: latestThread.id },
      data: {
        status: 'closed',
        updatedAt: daysAgo(now, 2),
        aiSummary: 'Latest closed thread.',
      },
    });

    mockSummarizeCustomerMemory.mockImplementation(async ({ closedThread }) => memory({
      summary: 'Refreshed from stale cron.',
      recentInteractions: [{
        threadId: closedThread.id,
        channel: closedThread.channelType,
        tag: closedThread.tag ?? null,
        closedAt: closedThread.closedAt.toISOString(),
        outcome: 'Refreshed from latest closed thread.',
      }],
    }));

    const result = await refreshStaleCustomerMemory({ now });

    expect(result).toEqual({
      organizationsChecked: 1,
      organizationsSkippedForSpendCap: 0,
      customersMatched: 1,
      customersRefreshed: 1,
    });
    expect(mockEnforceSpendCap).toHaveBeenCalledWith(org.id, null);
    expect(mockSummarizeCustomerMemory).toHaveBeenCalledTimes(1);
    expect(mockSummarizeCustomerMemory.mock.calls[0][0].closedThread.id).toBe(latestThread.id);

    const updated = await db.customer.findUnique({
      where: { id: customer.id },
      select: { memory: true, memoryUpdatedAt: true },
    });
    expect(updated?.memoryUpdatedAt).toBeInstanceOf(Date);
    expect(updated?.memory).toMatchObject({
      summary: 'Refreshed from stale cron.',
      recentInteractions: [expect.objectContaining({ threadId: latestThread.id })],
    });

    mockSummarizeCustomerMemory.mockClear();
    const rerun = await refreshStaleCustomerMemory({ now });

    expect(rerun.customersMatched).toBe(0);
    expect(rerun.customersRefreshed).toBe(0);
    expect(mockSummarizeCustomerMemory).not.toHaveBeenCalled();
  });

  it('skips stale-refresh orgs that are already over the LLM spend cap', async () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    const staleAt = daysAgo(now, 31);
    const customer = await createTestCustomer(org.id, 'memory-spend-cap@example.com');
    await db.organization.update({
      where: { id: org.id },
      data: { settings: { dailyLLMSpendCapUsd: 1 } },
    });
    await db.customer.update({
      where: { id: customer.id },
      data: { memoryUpdatedAt: staleAt },
    });

    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({
      where: { id: thread.id },
      data: { status: 'closed', updatedAt: daysAgo(now, 1) },
    });
    mockEnforceSpendCap.mockRejectedValueOnce(new SpendCapError(1_000, 1_000));

    const result = await refreshStaleCustomerMemory({ now });

    expect(result).toEqual({
      organizationsChecked: 1,
      organizationsSkippedForSpendCap: 1,
      customersMatched: 0,
      customersRefreshed: 0,
    });
    expect(mockSummarizeCustomerMemory).not.toHaveBeenCalled();

    const updated = await db.customer.findUnique({
      where: { id: customer.id },
      select: { memoryUpdatedAt: true },
    });
    expect(updated?.memoryUpdatedAt?.getTime()).toBe(staleAt.getTime());
  });
});
