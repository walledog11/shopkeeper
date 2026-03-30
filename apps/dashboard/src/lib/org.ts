import { db } from '@clerk/db';
import { auth, clerkClient } from '@clerk/nextjs/server';

/**
 * Looks up the Organization for the currently active Clerk organization.
 * Creates one on first use if it doesn't exist yet.
 */
export async function getOrCreateOrg() {
  const { userId, orgId } = await auth();

  if (!userId) throw new Error('Unauthenticated');
  if (!orgId) throw new Error('No active organization');

  const existing = await db.organization.findUnique({
    where: { clerkOrgId: orgId },
  });

  if (existing) return existing;

  // First time this Clerk org is seen — provision it in our DB
  const client = await clerkClient();
  const clerkOrg = await client.organizations.getOrganization({ organizationId: orgId });

  return db.organization.create({
    data: {
      clerkOrgId: orgId,
      name: clerkOrg.name,
    },
  });
}
