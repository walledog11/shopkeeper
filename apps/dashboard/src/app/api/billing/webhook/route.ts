import { NextResponse } from 'next/server'
import {
  SUBSCRIPTION_STATUSES,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '@shopkeeper/analytics'
import stripe from '@/lib/billing/stripe'
import {
  claimStripeWebhookEvent,
  failStripeWebhookEvent,
  processClaimedStripeWebhookEvent,
} from '@/lib/billing/stripe-webhook-events'
import { getBillingPriceIds } from '@/lib/env'
import logger from '@/lib/server/logger'
import { captureSubscriptionStatusChanged } from '@/lib/server/product-analytics'
import type Stripe from 'stripe'

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

  let claimed
  try {
    claimed = await claimStripeWebhookEvent(event)
  } catch (error) {
    logger.error({ err: error, stripeEventId: event.id }, '[StripeWebhook] Durable claim failed')
    return NextResponse.json({ received: false, retry: true }, { status: 500 })
  }

  if (claimed.state === 'completed') {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (claimed.state === 'processing') {
    return NextResponse.json({ received: false, retry: true }, { status: 503 })
  }

  let processed
  try {
    processed = await processClaimedStripeWebhookEvent(event, claimed.claim)
  } catch (error) {
    await failStripeWebhookEvent(event.id, claimed.claim.claimToken, error).catch((failureError) => {
      logger.error(
        { err: failureError, stripeEventId: event.id },
        '[StripeWebhook] Failed to record processing failure',
      )
    })
    logger.error({ err: error, stripeEventId: event.id }, '[StripeWebhook] Processing failed')
    return NextResponse.json({ received: false, retry: true }, { status: 500 })
  }

  if (processed.transition) {
    await captureCommittedSubscriptionTransition({
      ...processed.transition,
      stripeEventId: event.id,
    }).catch((error) => {
      logger.warn(
        { err: error, stripeEventId: event.id },
        '[StripeWebhook] Post-commit analytics capture failed',
      )
    })
  }

  return NextResponse.json({
    received: true,
    ...(processed.ignoredAsStale ? { stale: true } : {}),
  })
}
