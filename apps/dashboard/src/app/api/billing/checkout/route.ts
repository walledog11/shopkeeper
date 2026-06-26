import { NextResponse } from 'next/server'
import { readRequiredJsonObject } from '@/lib/api/body'
import stripe from '@/lib/billing/stripe'
import { getOrCreateStripeCustomer } from '@/lib/billing/stripe-customer'
import { getBillingTierPriceId, getDashboardAppUrl } from '@/lib/env'
import { withOrgRoute } from '@/lib/api/route'
import { parseCheckoutBody } from '@/app/api/billing/_lib/validation'

export const POST = withOrgRoute(
  {
    context: 'Billing Checkout POST',
    errorMessage: 'Failed to create checkout session',
    rateLimit: { key: 'billing:checkout', limit: 5, windowSecs: 3600 },
  },
  async ({ org, request }) => {
    const { tier } = parseCheckoutBody(await readRequiredJsonObject(request))

    const priceId = getBillingTierPriceId(tier)
    if (!priceId) {
      return NextResponse.json({ error: `No price configured for tier: ${tier}` }, { status: 400 })
    }

    const customerId = await getOrCreateStripeCustomer(org)

    const appUrl = getDashboardAppUrl()

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { clerkOrgId: org.clerkOrgId },
      },
      success_url: `${appUrl}/dashboard`,
      cancel_url: `${appUrl}/dashboard`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  },
)
