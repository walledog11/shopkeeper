import { NextResponse, type NextRequest } from 'next/server'
import { beginWorkspaceDeletion, db } from '@shopkeeper/db'
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

      const org = await db.organization.findUnique({ where: { clerkOrgId }, select: { id: true } })
      if (!org) return NextResponse.json({ received: true, deleted: 0 })
      const started = await beginWorkspaceDeletion(org.id)
      if (started) {
        // A signed provider event is evidence that this external step finished.
        // Preserve local credentials and billing references until cleanup completes.
        await db.workspaceDeletion.update({
          where: { id: started.operation.id },
          data: { clerkDeletedAt: new Date() },
        })
      }
      return NextResponse.json({ received: true, deletionPending: Boolean(started) })
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
