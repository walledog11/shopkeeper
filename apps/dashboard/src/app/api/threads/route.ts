import { NextResponse } from 'next/server';
import { db, SenderType, ThreadFilterStatus } from '@shopkeeper/db';
import { withOrgRoute } from '@/lib/api/route';
import {
  countThreadsBySqlFilters,
  listThreadIdsBySqlFilters,
  decodeThreadCursor,
} from '@/lib/messaging/thread-list-query';

export const dynamic = 'force-dynamic';

const VALID_TAGS = new Set(['Shipping', 'Returns', 'Order Status', 'Product Inquiry']);
const DEFAULT_THREAD_PAGE_SIZE = 50;

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
    const rawCursor = searchParams.get('cursor');
    const decodedCursor = rawCursor ? decodeThreadCursor(rawCursor) : null;
    if (rawCursor && !decodedCursor) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
    const cursor = decodedCursor ?? undefined;
    const limitParam = searchParams.get('limit');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = !isNaN(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : DEFAULT_THREAD_PAGE_SIZE;
    const wantsFiltered = filterStatusParam === ThreadFilterStatus.filtered;
    const needsReply = searchParams.get('needsReply') === 'true';
    const forMe = searchParams.get('forMe') === 'true';
    const hasDraft = searchParams.get('hasDraft') === 'true';
    const tagParam = searchParams.get('tag');
    const tag = tagParam && VALID_TAGS.has(tagParam) ? tagParam : undefined;
    const channelTypeParam = searchParams.get('channelType');
    const channelType = channelTypeParam && channelTypeParam.length > 0 ? channelTypeParam : undefined;

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
