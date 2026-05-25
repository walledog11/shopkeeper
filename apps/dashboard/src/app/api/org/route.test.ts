import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { GET, PATCH, DELETE } from './route';
import { auth, clerkClient } from '@clerk/nextjs/server';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
const mockUpdateOrganization = vi.fn();
const mockDeleteOrganization = vi.fn();
const mockGetOrganizationMembershipList = vi.fn();

function setAuth(overrides: Partial<{ userId: string | null; orgId: string | null; orgRole: string | null }> = {}) {
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_test',
    orgId: org.clerkOrgId,
    orgRole: 'org:admin',
    ...overrides,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
}

beforeEach(async () => {
  org = await createTestOrg();
  setAuth();
  vi.mocked(clerkClient).mockResolvedValue({
    organizations: {
      updateOrganization: mockUpdateOrganization,
      deleteOrganization: mockDeleteOrganization,
    },
    users: { getOrganizationMembershipList: mockGetOrganizationMembershipList },
  } as unknown as Awaited<ReturnType<typeof clerkClient>>);
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

describe('/api/org PATCH settings', () => {
  it('can unset explicit autonomy override fields while preserving other settings', async () => {
    await db.organization.update({
      where: { id: org.id },
      data: {
        settings: {
          autonomyTier: 'guarded',
          maxRefundAmount: 25,
          brandVoice: 'warm',
          toolsEnabled: {
            action: false,
            communication: true,
          },
        },
      },
    });

    const res = await PATCH(new Request('http://localhost:3000/api/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: { autonomyTier: 'trusted' },
        settingsUnset: ['maxRefundAmount', 'toolsEnabled.action'],
      }),
    }));

    expect(res.status).toBe(200);
    const body = await res.json() as {
      settings: {
        autonomyTier?: string;
        maxRefundAmount?: number;
        brandVoice?: string;
        toolsEnabled?: Record<string, boolean>;
      };
    };
    expect(body.settings.autonomyTier).toBe('trusted');
    expect(body.settings.brandVoice).toBe('warm');
    expect(body.settings.maxRefundAmount).toBeUndefined();
    expect(body.settings.toolsEnabled).toEqual({ communication: true });

    const saved = await db.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(saved.settings).toMatchObject({
      autonomyTier: 'trusted',
      brandVoice: 'warm',
      toolsEnabled: { communication: true },
    });
    expect((saved.settings as Record<string, unknown>).maxRefundAmount).toBeUndefined();
  });

  it('rejects unknown settingsUnset paths', async () => {
    const res = await PATCH(new Request('http://localhost:3000/api/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settingsUnset: ['billing.status'] }),
    }));

    expect(res.status).toBe(400);
  });
});

describe('/api/org DELETE', () => {
  function deleteReq(confirmName: string) {
    return new Request('http://localhost:3000/api/org', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmName }),
    });
  }

  it('refuses to delete when this is the user\'s only workspace', async () => {
    mockGetOrganizationMembershipList.mockResolvedValueOnce({
      data: [{ organization: { id: org.clerkOrgId } }],
    });

    const res = await DELETE(deleteReq(org.name));

    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('last_workspace');
    expect(mockDeleteOrganization).not.toHaveBeenCalled();
    const stillThere = await db.organization.findUnique({ where: { id: org.id } });
    expect(stillThere).not.toBeNull();
  });

  it('deletes the workspace when the user has another workspace', async () => {
    mockGetOrganizationMembershipList.mockResolvedValueOnce({
      data: [
        { organization: { id: org.clerkOrgId } },
        { organization: { id: 'org_other' } },
      ],
    });

    const res = await DELETE(deleteReq(org.name));

    expect(res.status).toBe(204);
    expect(mockDeleteOrganization).toHaveBeenCalledWith(org.clerkOrgId);
    const gone = await db.organization.findUnique({ where: { id: org.id } });
    expect(gone).toBeNull();
  });

  it('rejects non-admin callers before touching memberships', async () => {
    setAuth({ orgRole: 'org:member' });

    const res = await DELETE(deleteReq(org.name));

    expect(res.status).toBe(403);
    expect(mockGetOrganizationMembershipList).not.toHaveBeenCalled();
    expect(mockDeleteOrganization).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirmation name before touching memberships', async () => {
    const res = await DELETE(deleteReq('wrong-name'));

    expect(res.status).toBe(400);
    expect(mockGetOrganizationMembershipList).not.toHaveBeenCalled();
    expect(mockDeleteOrganization).not.toHaveBeenCalled();
  });
});
