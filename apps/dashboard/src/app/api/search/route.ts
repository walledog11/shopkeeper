import { NextResponse } from 'next/server';
import { db, SenderType } from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { CHANNEL_TYPE } from '@/lib/messaging/thread-constants';

export const dynamic = 'force-dynamic';

export const GET = withOrgRoute(
  {
    context: 'Search GET',
    errorMessage: 'Failed to perform search',
    rateLimit: { key: 'search', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() ?? '';

    if (q.length < 2) {
      throw new BadRequestError('Query must be at least 2 characters');
    }

    const threads = await db.thread.findMany({
      where: {
        organizationId: org.id,
        channelType: { notIn: [CHANNEL_TYPE.SMS_AGENT, CHANNEL_TYPE.DASHBOARD_AGENT] },
        archivedAt: null,
        deletedAt: null,
        OR: [
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          { aiSummary: { contains: q, mode: 'insensitive' } },
          { tag: { contains: q, mode: 'insensitive' } },
          {
            messages: {
              some: {
                contentText: { contains: q, mode: 'insensitive' },
                deletedAt: null,
              },
            },
          },
        ],
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
      take: 50,
    });

    return NextResponse.json({ threads });
  },
);
