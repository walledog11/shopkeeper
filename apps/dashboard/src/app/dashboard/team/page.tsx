import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import TeamPageClient from './_components/TeamPageClient';

export default async function TeamPage() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) redirect('/login');

  const client = await clerkClient();
  const [memberships, invitations] = await Promise.all([
    client.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 100 }),
    client.organizations.getOrganizationInvitationList({ organizationId: orgId, status: ['pending'] }),
  ]);

  const members = memberships.data.map(m => ({
    id: m.id,
    userId: m.publicUserData?.userId ?? '',
    firstName: m.publicUserData?.firstName ?? null,
    lastName: m.publicUserData?.lastName ?? null,
    imageUrl: m.publicUserData?.imageUrl ?? null,
    identifier: m.publicUserData?.identifier ?? '',
    role: m.role,
    createdAt: m.createdAt,
  }));

  const pendingInvitations = invitations.data.map(i => ({
    id: i.id,
    emailAddress: i.emailAddress,
    role: i.role,
    createdAt: i.createdAt,
  }));

  return (
    <TeamPageClient
      initialMembers={members}
      initialInvitations={pendingInvitations}
      currentUserId={userId}
    />
  );
}
