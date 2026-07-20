import { randomUUID } from 'node:crypto'
import { db } from '@shopkeeper/db'
import type Stripe from 'stripe'

const ACTIVE_CLAIM_MS = 5 * 60 * 1000

export interface StripeWebhookClaim {
  claimToken: string
  customerId: string | null
  subscriptionId: string | null
}

export type StripeWebhookClaimResult =
  | { state: 'claimed'; claim: StripeWebhookClaim }
  | { state: 'completed' }
  | { state: 'processing' }

export interface SubscriptionTransition {
  newStatus: string | null
  organizationId: string
  planPriceId: string | null
  previousStatus: string | null
}

export interface StripeWebhookProcessResult {
  ignoredAsStale: boolean
  transition: SubscriptionTransition | null
}

interface StripeWebhookRow {
  claimed_at: Date | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  stripe_created_at: Date
  event_type: string
}

interface StripeObjectReference {
  id: string
}

interface StripeEventObject {
  customer?: string | StripeObjectReference | null
  id?: string
  items?: { data?: Array<{ price?: { id?: string | null } }> }
  parent?: {
    subscription_details?: {
      subscription?: string | StripeObjectReference | null
    } | null
  } | null
  status?: string
  subscription?: string | StripeObjectReference | null
  trial_end?: number | null
}

function referenceId(value: string | StripeObjectReference | null | undefined): string | null {
  if (typeof value === 'string') return value
  return value?.id ?? null
}

function eventObject(event: Stripe.Event): StripeEventObject {
  return event.data.object as unknown as StripeEventObject
}

function eventCustomerId(event: Stripe.Event): string | null {
  return referenceId(eventObject(event).customer)
}

function eventSubscriptionId(event: Stripe.Event): string | null {
  const object = eventObject(event)
  if (event.type.startsWith('customer.subscription.')) {
    return object.id ?? null
  }
  return referenceId(object.subscription)
    ?? referenceId(object.parent?.subscription_details?.subscription)
}

function eventCreatedAt(event: Stripe.Event): Date {
  if (!Number.isFinite(event.created) || event.created <= 0) {
    throw new Error('Stripe event is missing a valid creation timestamp')
  }
  return new Date(event.created * 1000)
}

function eventCanAdvanceOrganization(args: {
  eventCreatedAt: Date
  eventId: string
  lastEventCreatedAt: Date | null
  lastEventId: string | null
}): boolean {
  if (!args.lastEventCreatedAt) return true
  const timeDifference = args.eventCreatedAt.getTime() - args.lastEventCreatedAt.getTime()
  if (timeDifference !== 0) return timeDifference > 0
  return args.eventId > (args.lastEventId ?? '')
}

export async function claimStripeWebhookEvent(
  event: Stripe.Event,
): Promise<StripeWebhookClaimResult> {
  const claimToken = randomUUID()
  const now = new Date()
  const staleBefore = new Date(now.getTime() - ACTIVE_CLAIM_MS)
  const stripeCreatedAt = eventCreatedAt(event)
  const customerId = eventCustomerId(event)
  const subscriptionId = eventSubscriptionId(event)

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "stripe_webhook_events" (
        "id",
        "event_type",
        "stripe_created_at",
        "customer_id",
        "subscription_id"
      ) VALUES (
        ${event.id},
        ${event.type},
        ${stripeCreatedAt},
        ${customerId},
        ${subscriptionId}
      )
      ON CONFLICT ("id") DO NOTHING
    `

    const rows = await tx.$queryRaw<StripeWebhookRow[]>`
      SELECT "status", "claimed_at", "stripe_created_at", "event_type"
      FROM "stripe_webhook_events"
      WHERE "id" = ${event.id}
      FOR UPDATE
    `
    const row = rows[0]
    if (!row) throw new Error('Stripe event ledger row was not created')
    if (
      row.event_type !== event.type
      || row.stripe_created_at.getTime() !== stripeCreatedAt.getTime()
    ) {
      throw new Error('Stripe event identity changed across deliveries')
    }
    if (row.status === 'completed') return { state: 'completed' }
    if (row.status === 'processing' && row.claimed_at && row.claimed_at > staleBefore) {
      return { state: 'processing' }
    }

    await tx.stripeWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: 'processing',
        claimToken,
        claimedAt: now,
        processedAt: null,
        attempts: { increment: 1 },
        lastError: null,
      },
    })

    return {
      state: 'claimed',
      claim: { claimToken, customerId, subscriptionId },
    }
  })
}

export async function processClaimedStripeWebhookEvent(
  event: Stripe.Event,
  claim: StripeWebhookClaim,
): Promise<StripeWebhookProcessResult> {
  const stripeCreatedAt = eventCreatedAt(event)

  return db.$transaction(async (tx) => {
    const ledger = await tx.stripeWebhookEvent.findUnique({
      where: { id: event.id },
      select: { claimToken: true, status: true },
    })
    if (ledger?.status !== 'processing' || ledger.claimToken !== claim.claimToken) {
      throw new Error('Stripe event claim was lost before processing')
    }

    let ignoredAsStale = false
    let organizationId: string | null = null
    let transition: SubscriptionTransition | null = null

    if (claim.customerId) {
      const lockedOrganizations = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "organizations"
        WHERE "stripe_customer_id" = ${claim.customerId}
        FOR UPDATE
      `
      organizationId = lockedOrganizations[0]?.id ?? null
    }

    if (organizationId) {
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: {
          stripePriceId: true,
          stripeStateEventCreatedAt: true,
          stripeStateEventId: true,
          stripeStatus: true,
          stripeSubscriptionId: true,
        },
      })
      const advancesState = eventCanAdvanceOrganization({
        eventCreatedAt: stripeCreatedAt,
        eventId: event.id,
        lastEventCreatedAt: organization.stripeStateEventCreatedAt,
        lastEventId: organization.stripeStateEventId,
      })
      const object = eventObject(event)

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.trial_will_end': {
          const subscriptionMatches = !organization.stripeSubscriptionId
            || organization.stripeSubscriptionId === claim.subscriptionId
            || event.type === 'customer.subscription.created'
          if (!advancesState || !subscriptionMatches || !claim.subscriptionId || !object.status) {
            ignoredAsStale = true
            break
          }
          const priceId = object.items?.data?.[0]?.price?.id ?? null
          await tx.organization.update({
            where: { id: organizationId },
            data: {
              stripeSubscriptionId: claim.subscriptionId,
              stripeStatus: object.status,
              stripePriceId: priceId,
              trialEndsAt: object.trial_end ? new Date(object.trial_end * 1000) : null,
              stripeStateEventCreatedAt: stripeCreatedAt,
              stripeStateEventId: event.id,
            },
          })
          transition = {
            previousStatus: organization.stripeStatus,
            newStatus: object.status,
            planPriceId: priceId,
            organizationId,
          }
          break
        }
        case 'customer.subscription.deleted': {
          if (
            !advancesState
            || !claim.subscriptionId
            || organization.stripeSubscriptionId !== claim.subscriptionId
          ) {
            ignoredAsStale = true
            break
          }
          await tx.organization.update({
            where: { id: organizationId },
            data: {
              stripeSubscriptionId: null,
              stripeStatus: 'canceled',
              stripePriceId: null,
              trialEndsAt: null,
              stripeStateEventCreatedAt: stripeCreatedAt,
              stripeStateEventId: event.id,
            },
          })
          transition = {
            previousStatus: organization.stripeStatus,
            newStatus: 'canceled',
            planPriceId: organization.stripePriceId,
            organizationId,
          }
          break
        }
        case 'invoice.payment_failed': {
          const subscriptionMatches = Boolean(
            claim.subscriptionId
            && organization.stripeSubscriptionId === claim.subscriptionId,
          )
          if (
            !advancesState
            || !subscriptionMatches
            || organization.stripeStatus === 'canceled'
          ) {
            ignoredAsStale = true
            break
          }
          await tx.organization.update({
            where: { id: organizationId },
            data: {
              stripeStatus: 'past_due',
              stripeStateEventCreatedAt: stripeCreatedAt,
              stripeStateEventId: event.id,
            },
          })
          transition = {
            previousStatus: organization.stripeStatus,
            newStatus: 'past_due',
            planPriceId: organization.stripePriceId,
            organizationId,
          }
          break
        }
        default:
          break
      }
    }

    const completed = await tx.stripeWebhookEvent.updateMany({
      where: {
        id: event.id,
        claimToken: claim.claimToken,
        status: 'processing',
      },
      data: {
        status: 'completed',
        organizationId,
        processedAt: new Date(),
        lastError: null,
      },
    })
    if (completed.count !== 1) {
      throw new Error('Stripe event claim was lost while completing')
    }

    return { ignoredAsStale, transition }
  })
}

export async function failStripeWebhookEvent(
  eventId: string,
  claimToken: string,
  error: unknown,
): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error)
  await db.stripeWebhookEvent.updateMany({
    where: { id: eventId, claimToken, status: 'processing' },
    data: {
      status: 'failed',
      processedAt: new Date(),
      lastError: detail,
    },
  })
}
