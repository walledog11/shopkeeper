import { NextResponse } from 'next/server';
import { db, SenderType, ThreadFilterStatus } from '@shopkeeper/db';
import { withOrgRoute } from '@/lib/api/route';
import { canonicalInboxThreadWhere } from '@/lib/messaging/inbox-filter';
import {
  countThreadsBySqlFilters,
  listThreadIdsBySqlFilters,
} from '@/lib/messaging/thread-list-query';
import type { ChannelType } from '@/types';

export const dynamic = 'force-dynamic';

const VALID_TAGS = new Set(['Shipping', 'Returns', 'Order Status', 'Product Inquiry']);

function usesSqlFilters(searchParams: URLSearchParams) {
  return searchParams.get('forMe') === 'true'
    || searchParams.get('hasDraft') === 'true'
    || searchParams.get('tag') !== null
    || searchParams.get('channelType') !== null;
}

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
    const includeCount = searchParams.get('includeCount') === 'true';
    const cursor = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = !isNaN(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : undefined;
    const wantsFiltered = filterStatusParam === ThreadFilterStatus.filtered;
    const needsReply = searchParams.get('needsReply') === 'true';
    const forMe = searchParams.get('forMe') === 'true';
    const hasDraft = searchParams.get('hasDraft') === 'true';
    const tagParam = searchParams.get('tag');
    const tag = tagParam && VALID_TAGS.has(tagParam) ? tagParam : undefined;
    const channelTypeParam = searchParams.get('channelType');
    const channelType = channelTypeParam && channelTypeParam.length > 0 ? channelTypeParam : undefined;

    if (usesSqlFilters(searchParams)) {
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

      if (ids.length === 0) {
        const totalCount = includeCount && !cursor
          ? await countThreadsBySqlFilters(org.id, sqlFilters)
          : undefined;
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

      const totalCount = includeCount && !cursor
        ? await countThreadsBySqlFilters(org.id, sqlFilters)
        : undefined;

      return NextResponse.json({ threads, nextCursor, ...(totalCount !== undefined ? { totalCount } : {}) });
    }

    const where = {
      ...canonicalInboxThreadWhere(org.id),
      ...(wantsFiltered
        ? { filterStatus: ThreadFilterStatus.filtered }
        : { status, filterStatus: { not: ThreadFilterStatus.filtered } }),
      ...(needsReply ? { lastMessageSenderType: SenderType.customer } : {}),
      ...(channelType ? { channelType: channelType as ChannelType } : {}),
      ...(tag ? { tag } : {}),
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

    const totalCount = includeCount && !cursor
      ? await db.thread.count({ where })
      : undefined;

    return NextResponse.json({ threads, nextCursor, ...(totalCount !== undefined ? { totalCount } : {}) });
  },
);
