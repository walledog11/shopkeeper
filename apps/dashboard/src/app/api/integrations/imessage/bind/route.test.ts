import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

import { DELETE, GET, POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

// The platform iMessage line is "connected" when its handle env is configured —
// there is no per-org integration to create.
function connectLine() {
  process.env.IMESSAGE_LINE_HANDLE = 'shopkeeper@imsg.test';
}

beforeEach(async () => {
  org = await createTestOrg();
  delete process.env.IMESSAGE_LINE_HANDLE;
  mockAuth.mockResolvedValue({ userId: 'usr_imessage', orgId: org.clerkOrgId });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  delete process.env.IMESSAGE_LINE_HANDLE;
  vi.clearAllMocks();
});

describe('/api/integrations/imessage/bind', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('reports line status and only the current user handles', async () => {
    connectLine();
    const me = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_imessage' },
    });
    const other = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_other' },
    });
    await db.orgMemberImessageBinding.createMany({
      data: [
        { orgMemberId: me.id, senderId: '+15551112222', spaceId: 'space_a', displayName: 'Raj' },
        { orgMemberId: other.id, senderId: '+15553334444', spaceId: 'space_b' },
      ],
    });

    const res = await GET();
    const body = await res.json() as {
      lineConnected: boolean;
      connected: boolean;
      handles: { senderId: string; displayLabel: string; connectedAt: string }[];
    };

    expect(res.status).toBe(200);
    expect(body.lineConnected).toBe(true);
    expect(body.connected).toBe(true);
    expect(body.handles).toHaveLength(1);
    expect(body.handles[0]).toMatchObject({ senderId: '+15551112222', displayLabel: 'Raj' });
  });

  it('falls back to senderId when no display name is stored', async () => {
    connectLine();
    const me = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_imessage' },
    });
    await db.orgMemberImessageBinding.create({
      data: { orgMemberId: me.id, senderId: '+15550009999', spaceId: 'space_c' },
    });

    const res = await GET();
    const body = await res.json() as { handles: { senderId: string; displayLabel: string }[] };

    expect(body.handles).toEqual([
      expect.objectContaining({ senderId: '+15550009999', displayLabel: '+15550009999' }),
    ]);
  });

  it('returns lineConnected false with no handles before a line is connected', async () => {
    const res = await GET();
    const body = await res.json() as { lineConnected: boolean; connected: boolean; handles: unknown[] };

    expect(body.lineConnected).toBe(false);
    expect(body.connected).toBe(false);
    expect(body.handles).toHaveLength(0);
  });

  it('returns 409 without minting a token when no line is connected', async () => {
    const res = await POST();

    expect(res.status).toBe(409);
    await expect(db.orgMemberBindToken.count()).resolves.toBe(0);
  });

  it('mints a scoped single-use bind token once a line is connected', async () => {
    connectLine();

    const res = await POST();
    const body = await res.json() as { token: string; expiresInSeconds: number };

    expect(res.status).toBe(200);
    expect(body.expiresInSeconds).toBe(86_400);
    expect(body.token).toBeTruthy();

    const stored = await db.orgMemberBindToken.findUnique({ where: { token: body.token } });
    expect(stored).toMatchObject({ organizationId: org!.id, clerkUserId: 'usr_imessage' });

    const member = await db.orgMember.findUnique({
      where: { organizationId_clerkUserId: { organizationId: org!.id, clerkUserId: 'usr_imessage' } },
      include: { imessageBindings: true },
    });
    expect(member).not.toBeNull();
    expect(member!.imessageBindings).toHaveLength(0);
  });

  it('unbinds a single handle scoped to the current user', async () => {
    connectLine();
    const me = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_imessage' },
    });
    const other = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_other' },
    });
    await db.orgMemberImessageBinding.createMany({
      data: [
        { orgMemberId: me.id, senderId: '+15551112222', spaceId: 'space_a' },
        { orgMemberId: me.id, senderId: '+15559998888', spaceId: 'space_b' },
        { orgMemberId: other.id, senderId: '+15553334444', spaceId: 'space_c' },
      ],
    });

    const res = await DELETE(new Request('http://localhost/api/integrations/imessage/bind?senderId=%2B15551112222'));

    expect(res.status).toBe(200);
    await expect(
      db.orgMemberImessageBinding.findMany({ where: { orgMemberId: me.id } }),
    ).resolves.toHaveLength(1);
    await expect(
      db.orgMemberImessageBinding.findMany({ where: { orgMemberId: other.id } }),
    ).resolves.toHaveLength(1);
  });

  it('unbinds all of the current user handles', async () => {
    connectLine();
    const me = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_imessage' },
    });
    await db.orgMemberImessageBinding.createMany({
      data: [
        { orgMemberId: me.id, senderId: '+15551112222', spaceId: 'space_a' },
        { orgMemberId: me.id, senderId: '+15559998888', spaceId: 'space_b' },
      ],
    });

    const res = await DELETE();

    expect(res.status).toBe(200);
    await expect(
      db.orgMemberImessageBinding.findMany({ where: { orgMemberId: me.id } }),
    ).resolves.toHaveLength(0);
  });
});
