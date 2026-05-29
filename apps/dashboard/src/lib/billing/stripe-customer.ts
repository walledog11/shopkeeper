import { db } from '@clerk/db'
import stripe from '@/lib/billing/stripe'

interface OrgBillingInfo {
  id: string
  stripeCustomerId: string | null
  name: string
  clerkOrgId: string
}

/**
 * Returns the Stripe customer ID for an org, creating one if it doesn't exist.
 *
 * Race-safe: uses an atomic conditional update so concurrent requests can't
 * create duplicate Stripe customers. If two requests race, the loser's
 * freshly-created customer is found via Stripe metadata search and reused
 * rather than orphaned.
 */
export async function getOrCreateStripeCustomer(org: OrgBillingInfo): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId

  // Check Stripe first in case a prior race already created a customer that
  // didn't make it back to the DB (e.g. server crash between create and update).
  const existing = await stripe.customers.search({
    query: `metadata['clerkOrgId']:'${org.clerkOrgId}'`,
    limit: 1,
  })

  const customerId = existing.data[0]?.id ?? (await stripe.customers.create({
    name: org.name,
    metadata: { clerkOrgId: org.clerkOrgId },
  })).id

  // Atomic conditional update , only writes if stripeCustomerId is still null.
  // If another request already committed a value, count will be 0.
  const result = await db.organization.updateMany({
    where: { id: org.id, stripeCustomerId: null },
    data: { stripeCustomerId: customerId },
  })

  if (result.count === 0) {
    const fresh = await db.organization.findUniqueOrThrow({ where: { id: org.id } })
    return fresh.stripeCustomerId!
  }

  return customerId
}
