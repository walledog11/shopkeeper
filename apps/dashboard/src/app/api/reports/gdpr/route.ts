import { NextResponse } from 'next/server'
import { db } from '@clerk/db'
import { getOrCreateOrg } from '@/lib/server/org'
import { handleApiError } from '@/lib/api/errors'
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit'
import { agentTurnMessageFilter } from '@/lib/agent/api/action-log'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg()

    const rl = await rateLimit(`reports-gdpr:${org.id}`, 5, 60)
    if (!rl.success) return tooManyRequests(rl.reset)

    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')?.trim().toLowerCase()

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: { equals: email, mode: 'insensitive' } },
    })

    if (!customer) {
      return NextResponse.json({ error: 'No customer found with that email' }, { status: 404 })
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
  } catch (error) {
    return handleApiError(error, 'Reports GDPR GET', 'Failed to export customer data')
  }
}
