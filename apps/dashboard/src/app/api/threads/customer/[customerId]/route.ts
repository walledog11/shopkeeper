import { NextResponse } from 'next/server';
import { db, SenderType } from '@shopkeeper/db';
import { withOrgRoute } from '@/lib/api/route';
import { merchantInboxInternalChannelFilter } from '@shopkeeper/agent/merchant-inbox-surfaces';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withOrgRoute<{ customerId: string }>(
  {
    context: 'Customer threads GET',
    errorMessage: 'Failed to fetch customer threads',
    rateLimit: { key: 'customer-threads', limit: 60, windowSecs: 60 },
  },
  async ({ org, request, params }) => {
    const { customerId } = params;
    if (!UUID_RE.test(customerId)) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 25)
      : undefined;

    const threads = await db.thread.findMany({
      where: {
        customerId,
        organizationId: org.id,
        channelType: merchantInboxInternalChannelFilter(),
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
