import { Suspense } from 'react';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import TeamPageClient from './_components/TeamPageClient';

interface TeamPageProps {
  searchParams?: Promise<{ invite?: string | string[] }>;
}

export default async function TeamPage({ searchParams }: TeamPageProps) {
  const { orgId, userId, orgRole } = await auth();
  if (!orgId || !userId) redirect('/login');
  const isAdmin = orgRole === 'org:admin';
  const params = await searchParams;
  const initialShowInviteModal = isAdmin && params?.invite === '1';

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
    <Suspense fallback={null}>
      <TeamPageClient
        initialMembers={members}
        initialInvitations={pendingInvitations}
        currentUserId={userId}
        isAdmin={isAdmin}
        initialShowInviteModal={initialShowInviteModal}
      />
    </Suspense>
  );
}
