import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { GET, POST, DELETE } from './route';
import { auth, clerkClient } from '@clerk/nextjs/server';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

const mockGetMemberships = vi.fn();
const mockGetInvitations = vi.fn();
const mockCreateInvitation = vi.fn();
const mockDeleteMembership = vi.fn();
const mockRevokeInvitation = vi.fn();

function setAuth(overrides: Partial<{ userId: string | null; orgId: string | null; orgRole: string | null }> = {}) {
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_admin',
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
      createOrganizationInvitation: mockCreateInvitation,
      deleteOrganizationMembership: mockDeleteMembership,
      getOrganizationInvitationList: mockGetInvitations,
      getOrganizationMembershipList: mockGetMemberships,
      revokeOrganizationInvitation: mockRevokeInvitation,
    },
  } as unknown as Awaited<ReturnType<typeof clerkClient>>);
  mockGetMemberships.mockResolvedValue({
    data: [{
      id: 'mem_1',
      publicUserData: {
        userId: 'usr_member',
        firstName: 'Ada',
        lastName: 'Lovelace',
        imageUrl: null,
        identifier: 'ada@example.com',
      },
      role: 'org:member',
      createdAt: 1_700_000_000_000,
    }],
  });
  mockGetInvitations.mockResolvedValue({ data: [] });
  mockCreateInvitation.mockResolvedValue({
    id: 'inv_1',
    emailAddress: 'new@example.com',
    role: 'org:member',
    createdAt: 1_700_000_000_000,
  });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('GET /api/team', () => {
  it('allows org members to list team members and invitations', async () => {
    setAuth({ orgRole: 'org:member' });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.members).toHaveLength(1);
    expect(body.invitations).toEqual([]);
    expect(mockGetMemberships).toHaveBeenCalledWith({ organizationId: org.clerkOrgId, limit: 100 });
    expect(mockGetInvitations).toHaveBeenCalledWith({ organizationId: org.clerkOrgId, status: ['pending'] });
  });
});

describe('POST /api/team', () => {
  it('allows org admins to invite members', async () => {
    const res = await POST(new Request('http://localhost/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailAddress: 'new@example.com', role: 'org:member' }),
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.emailAddress).toBe('new@example.com');
    expect(mockCreateInvitation).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: org.clerkOrgId,
      inviterUserId: 'usr_admin',
      emailAddress: 'new@example.com',
      role: 'org:member',
    }));
  });

  it('allows org admins to invite other admins', async () => {
    mockCreateInvitation.mockResolvedValueOnce({
      id: 'inv_admin',
      emailAddress: 'admin@example.com',
      role: 'org:admin',
      createdAt: 1_700_000_000_000,
    });

    const res = await POST(new Request('http://localhost/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailAddress: 'admin@example.com', role: 'org:admin' }),
    }));

    expect(res.status).toBe(200);
    expect(mockCreateInvitation).toHaveBeenCalledWith(expect.objectContaining({
      role: 'org:admin',
    }));
  });

  it('rejects invites from non-admin members', async () => {
    setAuth({ orgRole: 'org:member' });

    const res = await POST(new Request('http://localhost/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailAddress: 'new@example.com', role: 'org:member' }),
    }));

    expect(res.status).toBe(403);
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });

  it('rejects admin invites from non-admin members', async () => {
    setAuth({ orgRole: 'org:member' });

    const res = await POST(new Request('http://localhost/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailAddress: 'admin@example.com', role: 'org:admin' }),
    }));

    expect(res.status).toBe(403);
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/team', () => {
  it('allows org admins to remove members', async () => {
    const res = await DELETE(new Request('http://localhost/api/team?userId=usr_member'));

    expect(res.status).toBe(200);
    expect(mockDeleteMembership).toHaveBeenCalledWith({
      organizationId: org.clerkOrgId,
      userId: 'usr_member',
    });
  });

  it('allows org admins to revoke invitations', async () => {
    const res = await DELETE(new Request('http://localhost/api/team?invitationId=inv_1'));

    expect(res.status).toBe(200);
    expect(mockRevokeInvitation).toHaveBeenCalledWith({
      organizationId: org.clerkOrgId,
      invitationId: 'inv_1',
      requestingUserId: 'usr_admin',
    });
  });

  it('rejects member removals from non-admin members', async () => {
    setAuth({ orgRole: 'org:member' });

    const res = await DELETE(new Request('http://localhost/api/team?userId=usr_member'));

    expect(res.status).toBe(403);
    expect(mockDeleteMembership).not.toHaveBeenCalled();
    expect(mockRevokeInvitation).not.toHaveBeenCalled();
  });

  it('rejects invitation revocations from non-admin members', async () => {
    setAuth({ orgRole: 'org:member' });

    const res = await DELETE(new Request('http://localhost/api/team?invitationId=inv_1'));

    expect(res.status).toBe(403);
    expect(mockRevokeInvitation).not.toHaveBeenCalled();
  });
});
