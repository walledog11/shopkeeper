import { NextResponse } from 'next/server';
import { db, SenderType } from '@shopkeeper/db';
import { withOrgRoute } from '@/lib/api/route';
import { merchantInboxInternalChannelFilter } from '@shopkeeper/agent/merchant-inbox-surfaces';
import { parseSearchQuery } from './_lib/validation';

export const dynamic = 'force-dynamic';

export const GET = withOrgRoute(
  {
    context: 'Search GET',
    errorMessage: 'Failed to perform search',
    rateLimit: { key: 'search', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const q = parseSearchQuery(new URL(request.url).searchParams);

    const threads = await db.thread.findMany({
      where: {
        organizationId: org.id,
        channelType: merchantInboxInternalChannelFilter(),
        archivedAt: null,
        deletedAt: null,
        OR: [
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          // Email address / IG handle / phone — often the only name a customer has.
          { customer: { platformId: { contains: q, mode: 'insensitive' } } },
          { subject: { contains: q, mode: 'insensitive' } },
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
