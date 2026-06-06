import { NextResponse } from 'next/server';
import { db, SenderType } from '@clerk/db';
import { withOrgRoute } from '@/lib/api/route';
import { CHANNEL_TYPE } from '@clerk/agent/thread-constants';

export const dynamic = 'force-dynamic';

export const GET = withOrgRoute<{ customerId: string }>(
  {
    context: 'Customer threads GET',
    errorMessage: 'Failed to fetch customer threads',
    rateLimit: { key: 'customer-threads', limit: 60, windowSecs: 60 },
  },
  async ({ org, request, params }) => {
    const { customerId } = params;
    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 25)
      : undefined;

    const threads = await db.thread.findMany({
      where: {
        customerId,
        organizationId: org.id,
        channelType: { notIn: [CHANNEL_TYPE.SMS_AGENT, CHANNEL_TYPE.DASHBOARD_AGENT] },
        archivedAt: null,
        deletedAt: null,
      },
      include: {
        customer: true,
        messages: {
          where: { NOT: { senderType: SenderType.note }, deletedAt: null },
          orderBy: { sentAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      ...(limit ? { take: limit } : {}),
    });

    return NextResponse.json({ threads });
  },
);
