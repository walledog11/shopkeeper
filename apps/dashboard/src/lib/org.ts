import { db } from '@clerk/db';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getE2EBypassOrg } from '@/lib/server/e2e-org';

/**
 * Looks up the Organization for the currently active Clerk organization.
 * Creates one on first use if it doesn't exist yet.
 */
export async function getOrCreateOrg() {
  const e2eOrg = await getE2EBypassOrg();
  if (e2eOrg) return e2eOrg;

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

  try {
    return await db.organization.create({
      data: {
        clerkOrgId: orgId,
        name: clerkOrg.name,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code !== 'P2002') throw err;
    return db.organization.findUniqueOrThrow({ where: { clerkOrgId: orgId } });
  }
}
