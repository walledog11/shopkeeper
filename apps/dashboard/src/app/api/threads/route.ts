import { NextResponse } from 'next/server';
import { db, SenderType, ThreadFilterStatus } from '@shopkeeper/db';
import { withOrgRoute } from '@/lib/api/route';
import { canonicalInboxThreadWhere } from '@/lib/messaging/inbox-filter';

export const dynamic = 'force-dynamic';

export const GET = withOrgRoute(
  {
    context: 'Threads GET',
    errorMessage: 'Failed to fetch threads',
    rateLimit: { key: 'threads:get', limit: 60, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || 'open') as 'open' | 'closed';
    const filterStatusParam = searchParams.get('filterStatus');
    const preview = searchParams.get('preview') === 'true';
    const countOnly = searchParams.get('count') === 'true';
    const cursor = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = !isNaN(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : undefined;
    const wantsFiltered = filterStatusParam === ThreadFilterStatus.filtered;
    const needsReply = searchParams.get('needsReply') === 'true';
    const where = {
      ...canonicalInboxThreadWhere(org.id),
      ...(wantsFiltered
        ? { filterStatus: ThreadFilterStatus.filtered }
        : { status, filterStatus: { not: ThreadFilterStatus.filtered } }),
      ...(needsReply ? { lastMessageSenderType: SenderType.customer } : {}),
    };

    if (countOnly) {
      const count = await db.thread.count({ where });
      return NextResponse.json({ count });
    }

    const rows = await db.thread.findMany({
      where,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      ...(limit !== undefined ? { take: limit + 1 } : {}),
      include: {
        customer: true,
        messages: preview
          ? {
              where: { NOT: { senderType: SenderType.note }, deletedAt: null },
              orderBy: { sentAt: 'desc' },
              take: 1,
            }
          : { where: { deletedAt: null }, orderBy: { sentAt: 'asc' } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    let threads = rows;
    let nextCursor: string | null = null;
    if (limit !== undefined && rows.length > limit) {
      threads = rows.slice(0, limit);
      nextCursor = threads[threads.length - 1].id;
    }

    return NextResponse.json({ threads, nextCursor });
  },
);
