import { NextResponse } from 'next/server';
import { db, SenderType, ThreadFilterStatus } from '@shopkeeper/db';
import { withOrgRoute } from '@/lib/api/route';
import {
  countThreadsBySqlFilters,
  listThreadIdsBySqlFilters,
} from '@/lib/messaging/thread-list-query';
import { parseThreadListQuery } from './_lib/validation';

export const dynamic = 'force-dynamic';

export const GET = withOrgRoute(
  {
    context: 'Threads GET',
    errorMessage: 'Failed to fetch threads',
    rateLimit: { key: 'threads:get', limit: 60, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const {
      status,
      filterStatus,
      preview,
      countOnly,
      includeCount,
      cursor,
      limit,
      needsReply,
      forMe,
      hasDraft,
      tag,
      channelType,
    } = parseThreadListQuery(searchParams);
    const wantsFiltered = filterStatus === ThreadFilterStatus.filtered;

    const sqlFilters = {
      forMe,
      hasDraft,
      needsReply: !forMe && needsReply,
      tag,
      channelType,
      wantsFiltered,
      status: wantsFiltered ? undefined : status,
    };

    if (countOnly) {
      const count = await countThreadsBySqlFilters(org.id, sqlFilters);
      return NextResponse.json({ count });
    }

    const { ids, nextCursor } = await listThreadIdsBySqlFilters(org.id, sqlFilters, {
      cursor,
      limit,
    });

    const totalCount = includeCount && !cursor
      ? await countThreadsBySqlFilters(org.id, sqlFilters)
      : undefined;

    if (ids.length === 0) {
      return NextResponse.json({ threads: [], nextCursor: null, ...(totalCount !== undefined ? { totalCount } : {}) });
    }

    const rows = await db.thread.findMany({
      where: { id: { in: ids } },
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
    });
    const byId = new Map(rows.map(row => [row.id, row]));
    const threads = ids.flatMap((id: string) => {
      const thread = byId.get(id);
      return thread ? [thread] : [];
    });

    return NextResponse.json({ threads, nextCursor, ...(totalCount !== undefined ? { totalCount } : {}) });
  },
);
