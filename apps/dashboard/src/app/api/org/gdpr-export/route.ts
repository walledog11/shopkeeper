import { NextResponse } from 'next/server'
import { db } from '@shopkeeper/db'
import { BadRequestError, NotFoundError } from '@/lib/api/errors'
import { withOrgRoute } from '@/lib/api/route'
import { agentTurnMessageFilter } from '@shopkeeper/agent/turns'

export const dynamic = 'force-dynamic'

export const GET = withOrgRoute(
  {
    context: 'Org GDPR Export GET',
    errorMessage: 'Failed to export customer data',
    rateLimit: { key: 'org:gdpr-export', limit: 5, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url)
    const privacyRequestId = searchParams.get('privacyRequestId')?.trim()
    const privacyRequest = privacyRequestId
      ? await db.shopifyPrivacyRequest.findFirst({
          where: {
            id: privacyRequestId,
            organizationId: org.id,
            topic: 'customers/data_request',
            status: { in: ['pending', 'exported'] },
          },
        })
      : null
    const email = (privacyRequest?.customerEmail ?? searchParams.get('email'))?.trim().toLowerCase()
    const shopifyCustomerId = privacyRequest?.shopifyCustomerId?.trim() || null

    if (!email && !shopifyCustomerId) {
      if (privacyRequestId) {
        throw new NotFoundError('Open Shopify privacy request not found')
      }
      throw new BadRequestError('email is required')
    }

    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new BadRequestError('Invalid email address')
    }

    const customer = await db.customer.findFirst({
      where: {
        organizationId: org.id,
        OR: [
          ...(email ? [{ platformId: { equals: email, mode: 'insensitive' as const } }] : []),
          ...(shopifyCustomerId
            ? [{ threads: { some: { organizationId: org.id, shopifyCustomerId } } }]
            : []),
        ],
      },
    })

    if (!customer) {
      throw new NotFoundError('No customer found for that privacy request')
    }

    const threads = await db.thread.findMany({
      where: { customerId: customer.id, organizationId: org.id, deletedAt: null },
      include: {
        messages: {
          where: {
            deletedAt: null,
            NOT: { AND: [agentTurnMessageFilter] },
          },
          orderBy: { sentAt: 'asc' },
          select: { senderType: true, contentText: true, sentAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const exportData = {
      exportedAt: new Date().toISOString(),
      ...(privacyRequest && {
        shopifyPrivacyRequest: {
          id: privacyRequest.id,
          shopifyRequestId: privacyRequest.shopifyRequestId,
          shopDomain: privacyRequest.shopDomain,
        },
      }),
      organization: org.name,
      customer: {
        name: customer.name,
        platformId: customer.platformId,
        ...(shopifyCustomerId && { shopifyCustomerId }),
        createdAt: customer.createdAt,
      },
      threads: threads.map(t => ({
        id: t.id,
        channel: t.channelType,
        status: t.status,
        tag: t.tag,
        summary: t.aiSummary,
        createdAt: t.createdAt,
        messages: t.messages.map(m => ({
          sender: m.senderType,
          text: m.contentText,
          sentAt: m.sentAt,
        })),
      })),
    }

    if (privacyRequest) {
      await db.shopifyPrivacyRequest.updateMany({
        where: {
          id: privacyRequest.id,
          organizationId: org.id,
          status: { in: ['pending', 'exported'] },
        },
        data: { status: 'exported', exportedAt: new Date() },
      })
    }

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="customer-data-${(email ?? `shopify-${shopifyCustomerId}`).replace(/[^a-z0-9]/g, '-')}.json"`,
      },
    })
  },
)
