import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@shopkeeper/db'
import { verifyWebhook, type WebhookEvent } from '@clerk/nextjs/webhooks'
import logger from '@/lib/server/logger'

function hasSvixHeaders(headers: Headers) {
  return Boolean(
    headers.get('svix-id') &&
    headers.get('svix-timestamp') &&
    headers.get('svix-signature')
  )
}

export async function POST(request: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) {
    logger.error('[Clerk Webhook] CLERK_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  if (!hasSvixHeaders(request.headers)) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: WebhookEvent
  try {
    event = await verifyWebhook(request, { signingSecret: secret })
  } catch (error) {
    logger.warn({ err: error }, '[Clerk Webhook] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'organization.deleted': {
      const clerkOrgId = event.data.id
      if (!clerkOrgId) {
        logger.warn({ eventType: event.type }, '[Clerk Webhook] Missing organization id')
        return NextResponse.json({ received: true, skipped: true })
      }

      const result = await db.organization.deleteMany({ where: { clerkOrgId } })
      return NextResponse.json({ received: true, deleted: result.count })
    }

    case 'user.deleted': {
      const clerkUserId = event.data.id
      if (!clerkUserId) {
        logger.warn({ eventType: event.type }, '[Clerk Webhook] Missing user id')
        return NextResponse.json({ received: true, skipped: true })
      }

      const result = await db.orgMember.deleteMany({ where: { clerkUserId } })
      return NextResponse.json({ received: true, deleted: result.count })
    }

    case 'organizationMembership.deleted': {
      const clerkOrgId = event.data.organization.id
      const clerkUserId = event.data.public_user_data.user_id
      const result = await db.orgMember.deleteMany({
        where: {
          clerkUserId,
          organization: { clerkOrgId },
        },
      })

      return NextResponse.json({ received: true, deleted: result.count })
    }

    default:
      logger.info({ eventType: event.type }, '[Clerk Webhook] Ignored unsupported event')
      return NextResponse.json({ received: true, ignored: true })
  }
}
