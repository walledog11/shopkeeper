import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), clerkClient: vi.fn() }));

import { auth } from '@clerk/nextjs/server';
import { GET, POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;
const proposal = {
  brief: 'Warm, concise, and practical.',
  rationale: 'Operators consistently shortened replies.',
  basedOnCount: 4,
  createdAt: '2026-06-27T12:00:00.000Z',
};

function request(action: string) {
  return new Request('http://localhost/api/agent/voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

beforeEach(async () => {
  org = await createTestOrg();
  org = await db.organization.update({
    where: { id: org.id },
    data: { voiceProposal: proposal },
  });
  vi.mocked(auth).mockResolvedValue({ userId: 'user-1', orgId: org.clerkOrgId } as never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('/api/agent/voice', () => {
  it('returns the pending proposal', async () => {
    const response = await GET();

    expect(await response.json()).toEqual({ proposal });
  });

  it('dismisses without changing agent settings', async () => {
    const response = await POST(request('dismiss'));
    const updated = await db.organization.findUniqueOrThrow({ where: { id: org.id } });

    expect(response.status).toBe(200);
    expect(updated.voiceProposal).toBeNull();
    expect(updated.settings).toEqual({});
  });

  it('approves the brief and clears the proposal for billable organizations', async () => {
    const response = await POST(request('approve'));
    const updated = await db.organization.findUniqueOrThrow({ where: { id: org.id } });

    expect(response.status).toBe(200);
    expect(updated.voiceProposal).toBeNull();
    expect(updated.settings).toMatchObject({ brandVoice: proposal.brief });
  });

  it('does not clear the proposal when billing blocks approval', async () => {
    await db.organization.update({
      where: { id: org.id },
      data: { stripeStatus: 'past_due' },
    });

    const response = await POST(request('approve'));

    expect(response.status).toBe(402);
    await expect(db.organization.findUnique({ where: { id: org.id } })).resolves.toMatchObject({
      voiceProposal: proposal,
    });
  });
});
