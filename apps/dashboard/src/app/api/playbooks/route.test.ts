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
  mockAuth.mockResolvedValue({ userId: 'usr_playbooks', orgId: org.clerkOrgId });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  org = null;
  otherOrg = null;
  vi.clearAllMocks();
});

describe('/api/playbooks', () => {
  it('returns only the active org playbooks', async () => {
    otherOrg = await createTestOrg();
    await db.playbook.create({
      data: { organizationId: org!.id, name: 'Mine', trigger: { type: 'new_ticket' }, actions: [] },
    });
    await db.playbook.create({
      data: { organizationId: otherOrg.id, name: 'Foreign', trigger: { type: 'new_ticket' }, actions: [] },
    });

    const res = await GET();
    const body = await res.json() as { playbooks: Array<{ name: string }> };

    expect(res.status).toBe(200);
    expect(body.playbooks.map(p => p.name)).toEqual(['Mine']);
  });

  it('rejects invalid creates without persisting', async () => {
    const cases = [
      { name: '   ', trigger: { type: 'new_ticket' }, actions: [] },
      { name: 'Route', trigger: { type: '' }, actions: [] },
      { name: 'Route', trigger: { type: 'new_ticket' }, actions: { type: 'add_note' } },
    ];

    for (const body of cases) {
      const res = await POST(jsonRequest('http://localhost/api/playbooks', body));
      expect(res.status).toBe(400);
    }
    await expect(db.playbook.count({ where: { organizationId: org!.id } })).resolves.toBe(0);
  });

  it('creates normalized playbooks scoped to the active org', async () => {
    const res = await POST(jsonRequest('http://localhost/api/playbooks', {
      name: '  Escalate VIP ',
      trigger: { type: 'tag_applied', tag: 'VIP' },
      actions: [{ type: 'add_note', note: 'Review manually' }],
    }));
    const body = await res.json() as { playbook: { id: string; name: string; actions: unknown[] } };

    expect(res.status).toBe(201);
    expect(body.playbook).toMatchObject({
      name: 'Escalate VIP',
      actions: [{ type: 'add_note', note: 'Review manually' }],
    });

    const saved = await db.playbook.findUniqueOrThrow({ where: { id: body.playbook.id } });
    expect(saved.organizationId).toBe(org!.id);
  });

  it('rejects invalid updates without mutating the playbook', async () => {
    const playbook = await createPlaybook();

    const res = await PATCH(
      jsonRequest(`http://localhost/api/playbooks/${playbook.id}`, { enabled: 'nope' }, 'PATCH'),
      params(playbook.id),
    );

    expect(res.status).toBe(400);
    const unchanged = await db.playbook.findUniqueOrThrow({ where: { id: playbook.id } });
    expect(unchanged.enabled).toBe(true);
  });

  it('updates normalized fields on active org playbooks', async () => {
    const playbook = await createPlaybook();

    const res = await PATCH(
      jsonRequest(`http://localhost/api/playbooks/${playbook.id}`, {
        name: ' Updated ',
        enabled: false,
        actions: [{ type: 'close_ticket' }],
      }, 'PATCH'),
      params(playbook.id),
    );
    const body = await res.json() as { playbook: { name: string; enabled: boolean; actions: unknown[] } };

    expect(res.status).toBe(200);
    expect(body.playbook).toMatchObject({
      name: 'Updated',
      enabled: false,
      actions: [{ type: 'close_ticket' }],
    });
  });
});

function createPlaybook() {
  return db.playbook.create({
    data: {
      organizationId: org!.id,
      name: 'Original',
      enabled: true,
      trigger: { type: 'new_ticket' },
      actions: [],
    },
  });
}

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
