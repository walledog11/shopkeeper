import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@shopkeeper/agent/ai', () => ({
  generateText: mockGenerateText,
}));

import { auth } from '@clerk/nextjs/server';
import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_ai_summary',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockGenerateText.mockResolvedValue('Customer needs shipping help.');
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('POST /api/ai/summary', () => {
  it('rejects malformed JSON without generating a summary', async () => {
    const res = await POST(new Request('http://localhost/api/ai/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }));

    expect(res.status).toBe(400);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('returns 400 when threadId is missing', async () => {
    const res = await POST(jsonRequest({}));

    expect(res.status).toBe(400);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('generates and persists a summary for a valid thread', async () => {
    const customer = await createTestCustomer(org.id, 'summary@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await POST(jsonRequest({ threadId: thread.id }));
    const body = await res.json() as { summary: string };

    expect(res.status).toBe(200);
    expect(body.summary).toBe('Customer needs shipping help.');
    expect(mockGenerateText).toHaveBeenCalledOnce();
  });
});

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/ai/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
