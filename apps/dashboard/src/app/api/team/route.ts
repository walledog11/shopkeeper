import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { handleApiError } from '@/lib/api/errors';
import { readRequiredJsonObject } from '@/lib/api/body';
import { getDashboardAppUrl } from '@/lib/env';
import { parseTeamInviteBody } from '@/app/api/team/_lib/validation';

export async function GET() {
  try {
    const { orgId } = await auth();
    if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 401 });

    const client = await clerkClient();
    const [memberships, invitations] = await Promise.all([
      client.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 100 }),
      client.organizations.getOrganizationInvitationList({ organizationId: orgId, status: ['pending'] }),
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
  } catch (error) {
    return handleApiError(error, 'Team GET', 'Failed to fetch team');
  }
}

export async function POST(request: Request) {
  try {
    const { orgId, userId } = await auth();
    if (!orgId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { emailAddress, role } = parseTeamInviteBody(await readRequiredJsonObject(request));

    const client = await clerkClient();
    const invitation = await client.organizations.createOrganizationInvitation({
      organizationId: orgId,
      emailAddress,
      role,
      inviterUserId: userId,
      redirectUrl: `${getDashboardAppUrl()}/dashboard`,
    });

    return NextResponse.json({
      id: invitation.id,
      emailAddress: invitation.emailAddress,
      role: invitation.role,
      createdAt: invitation.createdAt,
    });
  } catch (error) {
    return handleApiError(error, 'Team POST', 'Failed to invite member');
  }
}

export async function DELETE(request: Request) {
  try {
    const { orgId, userId: requestingUserId } = await auth();
    if (!orgId || !requestingUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const invitationId = searchParams.get('invitationId');

    const client = await clerkClient();

    if (invitationId) {
      await client.organizations.revokeOrganizationInvitation({
        organizationId: orgId,
        invitationId,
        requestingUserId,
      });
    } else if (userId) {
      await client.organizations.deleteOrganizationMembership({ organizationId: orgId, userId });
    } else {
      return NextResponse.json({ error: 'userId or invitationId required' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, 'Team DELETE', 'Failed to remove member');
  }
}
