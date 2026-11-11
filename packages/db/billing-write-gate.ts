import { ApiError, NotFoundError } from '@shopkeeper/shared/errors';
import { db } from './client.js';

const BLOCKED_WRITE_STATUSES = new Set(['past_due', 'canceled']);

// A workspace billed through Shopify App Pricing stops writing when its plan
// has ended. Null is a store that never chose a plan, which writes as an
// unbilled workspace always has.
const BLOCKED_SHOPIFY_BILLING: Record<string, string> = {
  inactive: 'Your Shopkeeper plan has ended. Choose a plan in Shopify to continue.',
};

export interface BillingWriteOrg {
  stripeStatus: string | null;
  shopifyBillingStatus: string | null;
  lifecycleStatus?: string;
}

class BillingWriteBlockedError extends ApiError {
  constructor(message: string) {
    super(message, 402);
    this.name = 'BillingWriteBlockedError';
  }
}

function isBillingWriteBlocked(status: string | null | undefined): status is 'past_due' | 'canceled' {
  return typeof status === 'string' && BLOCKED_WRITE_STATUSES.has(status);
}

export function assertBillingWriteAllowed(org: BillingWriteOrg): void {
  if (org.lifecycleStatus && org.lifecycleStatus !== 'active') {
    throw new ApiError('Workspace deletion is in progress.', 409);
  }
  if (isBillingWriteBlocked(org.stripeStatus)) {
    throw new BillingWriteBlockedError(
      `Billing status ${org.stripeStatus} blocks write actions. Update billing to continue.`,
    );
  }
  const shopifyBlock = org.shopifyBillingStatus ? BLOCKED_SHOPIFY_BILLING[org.shopifyBillingStatus] : undefined;
  if (shopifyBlock) throw new BillingWriteBlockedError(shopifyBlock);
}

export async function assertBillingWriteAllowedForOrgId(orgId: string): Promise<void> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { stripeStatus: true, shopifyBillingStatus: true, lifecycleStatus: true },
  });

  if (!org) {
    throw new NotFoundError('Organization not found');
  }
  assertBillingWriteAllowed(org);
}
