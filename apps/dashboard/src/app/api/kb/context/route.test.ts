import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, NOTES_KB_SINGLETON_KEY } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(async () => {
  org = await createTestOrg();
  mockAuth.mockResolvedValue({ userId: 'usr_kb_context', orgId: org.clerkOrgId });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
});

describe('POST /api/kb/context', () => {
  it('uses one Notes knowledge base for concurrent first requests', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => POST(jsonRequest({
      content: `Context note ${index}`,
      category: 'other',
    }))));

    expect(responses.map(response => response.status)).toEqual(Array(8).fill(201));
    const payloads = await Promise.all(responses.map(response => (
      response.json() as Promise<{ article: { knowledgeBaseId: string } }>
    )));

    const notesBases = await db.knowledgeBase.findMany({
      where: {
        organizationId: org!.id,
        singletonKey: NOTES_KB_SINGLETON_KEY,
      },
      include: { articles: true },
    });
    expect(notesBases).toHaveLength(1);
    expect(notesBases[0]).toMatchObject({ name: 'Notes', source: 'user' });
    expect(notesBases[0].articles).toHaveLength(8);
    expect(new Set(payloads.map(payload => payload.article.knowledgeBaseId)))
      .toEqual(new Set([notesBases[0].id]));
  });
});

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/kb/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
