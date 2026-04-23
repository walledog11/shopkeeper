import { NextResponse } from 'next/server'
import { db } from '@clerk/db'
import stripe from '@/lib/billing/stripe'
import type Stripe from 'stripe'

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const sub = event.data.object as Stripe.Subscription

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.trial_will_end': {
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      await db.organization.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          stripeSubscriptionId: sub.id,
          stripeStatus: sub.status,
          stripePriceId: sub.items.data[0]?.price.id ?? null,
          trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
        },
      })
      break
    }
    case 'customer.subscription.deleted': {
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      await db.organization.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          stripeSubscriptionId: null,
          stripeStatus: 'canceled',
          stripePriceId: null,
          trialEndsAt: null,
        },
      })
      break
    }
    default:
      break
  }

  return NextResponse.json({ received: true })
}
