import { auth } from '@clerk/nextjs/server';
import { ForbiddenError, UnauthorizedError } from '@/lib/api/errors';
import { getE2EAuthIdentity } from '@/lib/e2e-auth';

// Admin-only operations are the ones that change what the agent is allowed to do
// (autonomy tier, refund cap, tool toggles), move money, hold provider
// credentials, or destroy data. Everything a member does day to day — tickets,
// agent runs and approvals, replies, KB, binding their own operator device —
// stays open to the whole workspace.
const ADMIN_ROLE = 'org:admin';

export const ADMIN_REQUIRED_MESSAGE = 'Only workspace admins can do this.';

// The signed-in member, or the E2E bypass identity under test, so a route reads
// the same identity in the preview as in production.
export async function currentUserId(): Promise<string | null> {
  return getE2EAuthIdentity()?.userId ?? (await auth()).userId;
}

export async function requireCurrentUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new UnauthorizedError();
  return userId;
}

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
