import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateOrg } from '@/lib/server/org'
import { handleApiError } from '@/lib/api/errors'
import { readRequiredJsonObject } from '@/lib/api/body'
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit'
import stripe from '@/lib/billing/stripe'
import { getOrCreateStripeCustomer } from '@/lib/billing/stripe-customer'
import { getDashboardAppUrl } from '@/lib/env'
import { parseCheckoutBody } from '@/app/api/billing/_lib/validation'

// Map tier slugs to env-var price IDs so the client never controls which price is used
const TIER_PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.PRICE_ID_STARTER,
  pro: process.env.PRICE_ID_PRO ?? process.env.PRICE_ID, // fall back to legacy PRICE_ID
}

export async function POST(req: NextRequest) {
  try {
    const { tier } = parseCheckoutBody(await readRequiredJsonObject(req))

    const priceId = TIER_PRICE_IDS[tier]
    if (!priceId) {
      return NextResponse.json({ error: `No price configured for tier: ${tier}` }, { status: 400 })
    }

    const org = await getOrCreateOrg()

    const rl = await rateLimit(`billing:checkout:${org.id}`, 5, 3600)
    if (!rl.success) return tooManyRequests(rl.reset)

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
  } catch (error) {
    return handleApiError(error, 'Billing Checkout POST', 'Failed to create checkout session')
  }
}
