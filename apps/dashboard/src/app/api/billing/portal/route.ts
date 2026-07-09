import { NextResponse } from 'next/server'
import { getOrCreateOrg } from '@/lib/server/org'
import { handleApiError } from '@/lib/api/errors'
import { readEmptyJsonBody } from '@/lib/api/body'
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit'
import stripe from '@/lib/billing/stripe'
import { getOrCreateStripeCustomer } from '@/lib/billing/stripe-customer'
import { getDashboardAppUrl } from '@/lib/env'

export async function POST(request?: Request) {
  try {
    if (request) await readEmptyJsonBody(request)

    const org = await getOrCreateOrg()

    // 5 portal sessions per hour per org — each call creates a Stripe session
    const rl = await rateLimit(`billing:portal:${org.id}`, 5, 3600)
    if (!rl.success) return tooManyRequests(rl.reset)

    const customerId = await getOrCreateStripeCustomer(org)

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getDashboardAppUrl()}/dashboard/settings#billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    return handleApiError(error, 'Billing Portal POST', 'Failed to create portal session')
  }
}
