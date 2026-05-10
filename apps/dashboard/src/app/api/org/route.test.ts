import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { GET, PATCH } from './route';
import { auth, clerkClient } from '@clerk/nextjs/server';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
const mockUpdateOrganization = vi.fn();

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_test',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  vi.mocked(clerkClient).mockResolvedValue({
    organizations: { updateOrganization: mockUpdateOrganization },
  } as Awaited<ReturnType<typeof clerkClient>>);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('/api/org billing access', () => {
  it('allows read access for a past-due org', async () => {
    await db.organization.update({
      where: { id: org.id },
      data: { stripeStatus: 'past_due' },
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json() as { stripeStatus: string | null };
    expect(body.stripeStatus).toBe('past_due');
  });

  it('blocks settings writes for a canceled org', async () => {
    await db.organization.update({
      where: { id: org.id },
      data: { stripeStatus: 'canceled' },
    });

    const res = await PATCH(new Request('http://localhost:3000/api/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Blocked Rename' }),
    }));

    expect(res.status).toBe(402);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Billing status canceled blocks write actions');

    const unchanged = await db.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(unchanged.name).toBe(org.name);
    expect(mockUpdateOrganization).not.toHaveBeenCalled();
  });
});
