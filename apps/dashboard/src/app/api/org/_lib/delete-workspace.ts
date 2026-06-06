import stripe from '@/lib/billing/stripe';
import { readOptionalJsonObject } from '@/lib/api/body';
import logger from '@/lib/server/logger';

export const LAST_WORKSPACE_MESSAGE =
  'This is your only workspace. Create another workspace first, or delete your account from Settings → Account to leave Clerk.';

export interface ClerkMembershipList {
  data: Array<{ organization: { id: string } }>;
}

export async function readWorkspaceDeleteConfirmation(request: Request): Promise<string | undefined> {
  const body = await readOptionalJsonObject(request, {
    malformed: { message: 'Invalid JSON body' },
    object: { message: 'Invalid request body' },
  });
  return typeof body?.confirmName === 'string' ? body.confirmName : undefined;
}

export function hasOtherWorkspace(memberships: ClerkMembershipList, clerkOrgId: string): boolean {
  return memberships.data.some(m => m.organization.id !== clerkOrgId);
}

export async function cancelWorkspaceSubscription(org: {
  id: string;
  stripeSubscriptionId: string | null;
}): Promise<void> {
  if (!org.stripeSubscriptionId) return;

  try {
    await stripe.subscriptions.cancel(org.stripeSubscriptionId);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== 'resource_missing') {
      logger.error({ err, orgId: org.id }, '[Org DELETE] Failed to cancel Stripe subscription');
      throw err;
    }
  }
}
