import { auth } from '@clerk/nextjs/server';
import { ForbiddenError } from '@/lib/api/errors';
import { getE2EAuthIdentity } from '@/lib/e2e-auth';

// Admin-only operations are the ones that change what the agent is allowed to do
// (autonomy tier, refund cap, tool toggles), move money, hold provider
// credentials, or destroy data. Everything a member does day to day — tickets,
// agent runs and approvals, replies, KB, binding their own operator device —
// stays open to the whole workspace.
export const ADMIN_ROLE = 'org:admin';

export const ADMIN_REQUIRED_MESSAGE = 'Only workspace admins can do this.';

export async function isOrgAdmin(): Promise<boolean> {
  // The E2E bypass identity is the workspace's only operator, so it is treated
  // as its admin; real requests always carry a Clerk role.
  if (getE2EAuthIdentity()) return true;
  const { orgRole } = await auth();
  return orgRole === ADMIN_ROLE;
}

export async function assertOrgAdmin(): Promise<void> {
  if (!(await isOrgAdmin())) {
    throw new ForbiddenError(ADMIN_REQUIRED_MESSAGE);
  }
}
