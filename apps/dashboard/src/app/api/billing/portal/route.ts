import { NextResponse } from 'next/server'
import { getOrCreateOrg } from '@/lib/org'
import { handleApiError } from '@/lib/api-errors'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import stripe from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/billing'
import { getDashboardAppUrl } from '@/lib/env'

export async function POST() {
  try {
    const org = await getOrCreateOrg()

    // 5 portal sessions per hour per org — each call creates a Stripe session
    const rl = await rateLimit(`billing:portal:${org.id}`, 5, 3600)
    if (!rl.success) return tooManyRequests(rl.reset)

    const customerId = await getOrCreateStripeCustomer(org)

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getDashboardAppUrl()}/dashboard/settings?tab=billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    return handleApiError(error, 'Billing Portal POST', 'Failed to create portal session')
  }
}
