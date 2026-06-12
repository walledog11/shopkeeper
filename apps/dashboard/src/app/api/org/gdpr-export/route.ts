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
    const email = searchParams.get('email')?.trim().toLowerCase()

    if (!email) {
      throw new BadRequestError('email is required')
    }

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestError('Invalid email address')
    }

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: { equals: email, mode: 'insensitive' } },
    })

    if (!customer) {
      throw new NotFoundError('No customer found with that email')
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
      organization: org.name,
      customer: {
        name: customer.name,
        platformId: customer.platformId,
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

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="customer-data-${email.replace(/[^a-z0-9]/g, '-')}.json"`,
      },
    })
  },
)
