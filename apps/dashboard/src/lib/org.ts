import { db } from '@clerk/db';
import { auth, currentUser } from '@clerk/nextjs/server';

/**
 * Looks up the Organization for the currently authenticated Clerk user.
 * Creates one on first login if it doesn't exist yet.
 *
 * Uses the Clerk userId as the clerkOrgId for now. When Clerk Organizations
 * are added to the onboarding flow, swap `userId` for `orgId` here.
 */
export async function getOrCreateOrg() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error('Unauthenticated');
  }

  const existing = await db.organization.findUnique({
    where: { clerkOrgId: userId },
  });

  if (existing) return existing;

  // First login — provision an organization for this user
  const user = await currentUser();
  const name =
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress ??
    'My Organization';

  return db.organization.create({
    data: {
      clerkOrgId: userId,
      name,
    },
  });
}
