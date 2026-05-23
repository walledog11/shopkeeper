import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

import { PATCH } from './[id]/route';
import { GET, POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(async () => {
  org = await createTestOrg();
  mockAuth.mockResolvedValue({ userId: 'usr_canned', orgId: org.clerkOrgId });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  org = null;
  otherOrg = null;
  vi.clearAllMocks();
});

describe('/api/canned-responses', () => {
  it('returns only the active org canned responses', async () => {
    otherOrg = await createTestOrg();
    await db.cannedResponse.create({
      data: { organizationId: org!.id, title: 'Mine', body: 'Use this', tags: [], channels: [] },
    });
    await db.cannedResponse.create({
      data: { organizationId: otherOrg.id, title: 'Foreign', body: 'Nope', tags: [], channels: [] },
    });

    const res = await GET();
    const body = await res.json() as { responses: Array<{ title: string }> };

    expect(res.status).toBe(200);
    expect(body.responses.map(r => r.title)).toEqual(['Mine']);
  });

  it('rejects invalid create bodies without persisting', async () => {
    const res = await POST(jsonRequest('http://localhost/api/canned-responses', {
      title: '   ',
      body: 'Saved reply',
      tags: ['billing'],
    }));

    expect(res.status).toBe(400);
    await expect(db.cannedResponse.count({ where: { organizationId: org!.id } })).resolves.toBe(0);
  });

  it('creates trimmed canned responses scoped to the active org', async () => {
    const res = await POST(jsonRequest('http://localhost/api/canned-responses', {
      title: '  Refund answer ',
      body: '  We can help. ',
      tags: [' billing ', '', 7],
      channels: [' email ', 'ig_dm'],
    }));
    const body = await res.json() as { response: { id: string; title: string; body: string; tags: string[]; channels: string[] } };

    expect(res.status).toBe(201);
    expect(body.response).toMatchObject({
      title: 'Refund answer',
      body: 'We can help.',
      tags: ['billing'],
      channels: ['email', 'ig_dm'],
    });

    const saved = await db.cannedResponse.findUniqueOrThrow({ where: { id: body.response.id } });
    expect(saved.organizationId).toBe(org!.id);
  });

  it('rejects invalid updates without mutating the response', async () => {
    const response = await db.cannedResponse.create({
      data: { organizationId: org!.id, title: 'Original', body: 'Body', tags: [], channels: [] },
    });

    const res = await PATCH(
      jsonRequest(`http://localhost/api/canned-responses/${response.id}`, { body: '   ' }, 'PATCH'),
      params(response.id),
    );

    expect(res.status).toBe(400);
    const unchanged = await db.cannedResponse.findUniqueOrThrow({ where: { id: response.id } });
    expect(unchanged.body).toBe('Body');
  });

  it('updates the active org response with normalized fields', async () => {
    const response = await db.cannedResponse.create({
      data: { organizationId: org!.id, title: 'Original', body: 'Body', tags: [], channels: [] },
    });

    const res = await PATCH(
      jsonRequest(`http://localhost/api/canned-responses/${response.id}`, {
        title: ' Updated ',
        tags: [' returns ', null, 'vip'],
      }, 'PATCH'),
      params(response.id),
    );
    const body = await res.json() as { response: { title: string; body: string; tags: string[] } };

    expect(res.status).toBe(200);
    expect(body.response).toMatchObject({
      title: 'Updated',
      body: 'Body',
      tags: ['returns', 'vip'],
    });
  });
});

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
