import { NextRequest, NextResponse } from 'next/server'
import { db } from '@clerk/db'
import { getOrCreateOrg } from '@/lib/org'
import { handleApiError } from '@/lib/api-errors'
import stripe from '@/lib/stripe'

// Map tier slugs to env-var price IDs so the client never controls which price is used
const TIER_PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.PRICE_ID_STARTER,
  pro: process.env.PRICE_ID_PRO ?? process.env.PRICE_ID, // fall back to legacy PRICE_ID
}

export async function POST(req: NextRequest) {
  try {
    const { tier } = await req.json() as { tier: string }

    const priceId = TIER_PRICE_IDS[tier]
    if (!priceId) {
      return NextResponse.json({ error: `No price configured for tier: ${tier}` }, { status: 400 })
    }

    const org = await getOrCreateOrg()

    // Ensure Stripe customer exists
    let customerId = org.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { clerkOrgId: org.clerkOrgId },
      })
      customerId = customer.id
      await db.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { clerkOrgId: org.clerkOrgId },
      },
      success_url: `${appUrl}/dashboard?onboarding=complete`,
      cancel_url: `${appUrl}/plan`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    return handleApiError(error, 'Billing Checkout POST', 'Failed to create checkout session')
  }
}
