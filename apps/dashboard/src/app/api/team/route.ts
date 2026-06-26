import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { readRequiredJsonObject } from '@/lib/api/body';
import { getDashboardAppUrl } from '@/lib/env';
import { withClerkOrgRoute } from '@/lib/api/clerk-route';
import { parseTeamInviteBody } from '@/app/api/team/_lib/validation';

export const GET = withClerkOrgRoute(
  {
    context: 'Team GET',
    errorMessage: 'Failed to fetch team',
    requireUser: false,
    unauthorizedMessage: 'No org',
  },
  async ({ auth }) => {
    const client = await clerkClient();
    const [memberships, invitations] = await Promise.all([
      client.organizations.getOrganizationMembershipList({ organizationId: auth.orgId, limit: 100 }),
      client.organizations.getOrganizationInvitationList({ organizationId: auth.orgId, status: ['pending'] }),
    ]);

    return NextResponse.json({
      members: memberships.data.map(m => ({
        id: m.id,
        userId: m.publicUserData?.userId ?? '',
        firstName: m.publicUserData?.firstName ?? null,
        lastName: m.publicUserData?.lastName ?? null,
        imageUrl: m.publicUserData?.imageUrl ?? null,
        identifier: m.publicUserData?.identifier ?? '',
        role: m.role,
        createdAt: m.createdAt,
      })),
      invitations: invitations.data.map(i => ({
        id: i.id,
        emailAddress: i.emailAddress,
        role: i.role,
        createdAt: i.createdAt,
      })),
    });
  },
);

export const POST = withClerkOrgRoute(
  { context: 'Team POST', errorMessage: 'Failed to invite member', requireAdmin: true },
  async ({ auth, request }) => {
    const { emailAddress, role } = parseTeamInviteBody(await readRequiredJsonObject(request));

    const client = await clerkClient();
    const invitation = await client.organizations.createOrganizationInvitation({
      organizationId: auth.orgId,
      emailAddress,
      role,
      inviterUserId: auth.userId as string,
      redirectUrl: `${getDashboardAppUrl()}/dashboard`,
    });

    return NextResponse.json({
      id: invitation.id,
      emailAddress: invitation.emailAddress,
      role: invitation.role,
      createdAt: invitation.createdAt,
    });
  },
);

export const DELETE = withClerkOrgRoute(
  { context: 'Team DELETE', errorMessage: 'Failed to remove member', requireAdmin: true },
  async ({ auth, request }) => {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const invitationId = searchParams.get('invitationId');

    const client = await clerkClient();

    if (invitationId) {
      await client.organizations.revokeOrganizationInvitation({
        organizationId: auth.orgId,
        invitationId,
        requestingUserId: auth.userId as string,
      });
    } else if (userId) {
      await client.organizations.deleteOrganizationMembership({ organizationId: auth.orgId, userId });
    } else {
      return NextResponse.json({ error: 'userId or invitationId required' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  },
);
