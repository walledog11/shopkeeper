import { db } from '@clerk/db';
import { ApiError, NotFoundError } from '@/lib/api/errors';

const BLOCKED_WRITE_STATUSES = new Set(['past_due', 'canceled']);

export interface BillingWriteOrg {
  stripeStatus: string | null;
}

class BillingWriteBlockedError extends ApiError {
  constructor(status: string) {
    super(`Billing status ${status} blocks write actions. Update billing to continue.`, 402);
    this.name = 'BillingWriteBlockedError';
  }
}

function isBillingWriteBlocked(status: string | null | undefined): status is 'past_due' | 'canceled' {
  return typeof status === 'string' && BLOCKED_WRITE_STATUSES.has(status);
}

export function assertBillingWriteAllowed(org: BillingWriteOrg): void {
  if (isBillingWriteBlocked(org.stripeStatus)) {
    throw new BillingWriteBlockedError(org.stripeStatus);
  }
}

export async function assertBillingWriteAllowedForOrgId(orgId: string): Promise<void> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { stripeStatus: true },
  });

  if (!org) {
    throw new NotFoundError('Organization not found');
  }
  assertBillingWriteAllowed(org);
}
