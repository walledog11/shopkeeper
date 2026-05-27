import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetGatewayBaseUrl, mockLoggerWarn } = vi.hoisted(() => ({
  mockGetGatewayBaseUrl: vi.fn(() => 'http://gateway.test'),
  mockLoggerWarn: vi.fn(),
}));

vi.mock('@/lib/server/gateway-url', () => ({
  getGatewayBaseUrl: mockGetGatewayBaseUrl,
}));

vi.mock('@/lib/server/logger', () => ({
  default: {
    warn: mockLoggerWarn,
  },
}));

import { enqueueCustomerMemoryForClosedThreads } from './customer-memory';

const originalSecret = process.env.INTERNAL_API_SECRET;
const originalEnableInTests = process.env.CUSTOMER_MEMORY_ENQUEUE_IN_TESTS;

beforeEach(() => {
  process.env.INTERNAL_API_SECRET = 'test-internal-secret';
  process.env.CUSTOMER_MEMORY_ENQUEUE_IN_TESTS = 'true';
  mockGetGatewayBaseUrl.mockReturnValue('http://gateway.test');
  mockLoggerWarn.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = originalSecret;
  if (originalEnableInTests === undefined) delete process.env.CUSTOMER_MEMORY_ENQUEUE_IN_TESTS;
  else process.env.CUSTOMER_MEMORY_ENQUEUE_IN_TESTS = originalEnableInTests;
});

describe('enqueueCustomerMemoryForClosedThreads', () => {
  it('posts deduped close targets with close-event timestamps', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const closedAt = new Date('2026-05-26T12:00:00.000Z');

    await enqueueCustomerMemoryForClosedThreads({
      organizationId: 'org_1',
      threads: [
        { threadId: ' thread_1 ', closedAt: '2026-05-20T10:00:00.000Z' },
        { threadId: 'thread_1', closedAt },
      ],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://gateway.test/internal/customer-memory/thread-close',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'test-internal-secret',
        },
        body: JSON.stringify({
          organizationId: 'org_1',
          threads: [{ threadId: 'thread_1', closedAt: closedAt.toISOString() }],
        }),
      }),
    );
  });

  it('chunks large enqueue requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    await enqueueCustomerMemoryForClosedThreads({
      organizationId: 'org_1',
      threads: Array.from({ length: 101 }, (_, i) => ({ threadId: `thread_${i}` })),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string) as { threads: unknown[] };
    const secondBody = JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string) as { threads: unknown[] };
    expect(firstBody.threads).toHaveLength(100);
    expect(secondBody.threads).toHaveLength(1);
  });
});
