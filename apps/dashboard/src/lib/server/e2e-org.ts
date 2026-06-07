import { db } from '@shopkeeper/db';
import { getE2EAuthIdentity } from '@/lib/e2e-auth';

export async function getE2EBypassOrg() {
  const identity = getE2EAuthIdentity();
  if (!identity) {
    return null;
  }

  const existing = await db.organization.findUnique({
    where: { clerkOrgId: identity.orgId },
  });

  if (existing) {
    return existing;
  }

  try {
    return await db.organization.create({
      data: {
        clerkOrgId: identity.orgId,
        name: identity.orgName,
        settings: {
          autoPlanOnOpen: false,
          spamFilterEnabled: false,
        },
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code !== 'P2002') throw err;
    return db.organization.findUniqueOrThrow({ where: { clerkOrgId: identity.orgId } });
  }
}
