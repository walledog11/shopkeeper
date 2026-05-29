import { NextResponse } from 'next/server'
import { db } from '@clerk/db'
import stripe from '@/lib/billing/stripe'
import { getRedis } from '@/lib/server/redis'
import type Stripe from 'stripe'

const STRIPE_EVENT_TTL_SECONDS = 60 * 60 * 24 * 7

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

  try {
    const claimed = await getRedis().set(`stripe:event:${event.id}`, '1', {
      nx: true,
      ex: STRIPE_EVENT_TTL_SECONDS,
    })
    if (claimed === null) {
      return NextResponse.json({ received: true, duplicate: true })
    }
  } catch {
    // Redis unavailable , fall through. All event handlers below are idempotent.
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.trial_will_end': {
      const sub = event.data.object as Stripe.Subscription
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
      const sub = event.data.object as Stripe.Subscription
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
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
      if (!customerId) break
      await db.organization.updateMany({
        where: { stripeCustomerId: customerId, stripeStatus: { not: 'canceled' } },
        data: { stripeStatus: 'past_due' },
      })
      break
    }
    default:
      break
  }

  return NextResponse.json({ received: true })
}
