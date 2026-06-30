import { NextResponse } from 'next/server'
import { db } from '@shopkeeper/db'
import {
  SUBSCRIPTION_STATUSES,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '@shopkeeper/analytics'
import stripe from '@/lib/billing/stripe'
import { getBillingPriceIds } from '@/lib/env'
import { captureSubscriptionStatusChanged } from '@/lib/server/product-analytics'
import { getRedis } from '@/lib/server/redis'
import type Stripe from 'stripe'

const STRIPE_EVENT_TTL_SECONDS = 60 * 60 * 24 * 7

function analyticsSubscriptionStatus(status: string | null): SubscriptionStatus | null {
  if (status === null) return 'none'
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
    ? status as SubscriptionStatus
    : null
}

function analyticsSubscriptionPlan(priceId: string | null): SubscriptionPlan | null {
  if (!priceId) return 'free'
  const prices = getBillingPriceIds()
  if (priceId === prices.starter) return 'starter'
  if (priceId === prices.pro) return 'pro'
  return null
}

async function captureCommittedSubscriptionTransition(args: {
  newStatus: string | null
  organizationId: string
  planPriceId: string | null
  previousStatus: string | null
  stripeEventId: string
}): Promise<void> {
  const previousStatus = analyticsSubscriptionStatus(args.previousStatus)
  const newStatus = analyticsSubscriptionStatus(args.newStatus)
  const plan = analyticsSubscriptionPlan(args.planPriceId)
  if (!previousStatus || !newStatus || !plan) return

  await captureSubscriptionStatusChanged({
    previousStatus,
    newStatus,
    plan,
    organizationId: args.organizationId,
    stripeEventId: args.stripeEventId,
  })
}

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
    // Redis unavailable — fall through. All event handlers below are idempotent.
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.trial_will_end': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      const organization = await db.organization.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true, stripeStatus: true },
      })
      if (!organization) break
      const priceId = sub.items.data[0]?.price.id ?? null
      await db.organization.update({
        where: { id: organization.id },
        data: {
          stripeSubscriptionId: sub.id,
          stripeStatus: sub.status,
          stripePriceId: priceId,
          trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
        },
      })
      await captureCommittedSubscriptionTransition({
        previousStatus: organization.stripeStatus,
        newStatus: sub.status,
        planPriceId: priceId,
        organizationId: organization.id,
        stripeEventId: event.id,
      })
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      const organization = await db.organization.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true, stripePriceId: true, stripeStatus: true },
      })
      if (!organization) break
      await db.organization.update({
        where: { id: organization.id },
        data: {
          stripeSubscriptionId: null,
          stripeStatus: 'canceled',
          stripePriceId: null,
          trialEndsAt: null,
        },
      })
      await captureCommittedSubscriptionTransition({
        previousStatus: organization.stripeStatus,
        newStatus: 'canceled',
        planPriceId: organization.stripePriceId,
        organizationId: organization.id,
        stripeEventId: event.id,
      })
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
      if (!customerId) break
      const organization = await db.organization.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true, stripePriceId: true, stripeStatus: true },
      })
      if (!organization || organization.stripeStatus === 'canceled') break
      await db.organization.update({
        where: { id: organization.id },
        data: { stripeStatus: 'past_due' },
      })
      await captureCommittedSubscriptionTransition({
        previousStatus: organization.stripeStatus,
        newStatus: 'past_due',
        planPriceId: organization.stripePriceId,
        organizationId: organization.id,
        stripeEventId: event.id,
      })
      break
    }
    default:
      break
  }

  return NextResponse.json({ received: true })
}
