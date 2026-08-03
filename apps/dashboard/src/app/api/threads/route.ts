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
    // A preview row carries only the newest message, which on an escalated thread is
    // the agent's handoff reply. One extra query per page gets each thread's newest
    // customer message so the list can show what the customer actually said.
    const latestCustomerMessages = preview
      ? await db.message.findMany({
          where: {
            organizationId: org.id,
            threadId: { in: ids },
            senderType: SenderType.customer,
            deletedAt: null,
          },
          orderBy: [{ threadId: 'asc' }, { sentAt: 'desc' }],
          distinct: ['threadId'],
        })
      : [];
    const latestCustomerByThread = new Map(
      latestCustomerMessages.map(message => [message.threadId, message]),
    );

    const byId = new Map(rows.map(row => [row.id, row]));
    const threads = ids.flatMap((id: string) => {
      const thread = byId.get(id);
      if (!thread) return [];
      const latestCustomer = latestCustomerByThread.get(id);
      if (!latestCustomer || thread.messages.some(message => message.id === latestCustomer.id)) {
        return [thread];
      }
      return [{
        ...thread,
        messages: [latestCustomer, ...thread.messages].sort(
          (a, b) => a.sentAt.getTime() - b.sentAt.getTime(),
        ),
      }];
    });

    return NextResponse.json({ threads, nextCursor, ...(totalCount !== undefined ? { totalCount } : {}) });
  },
);
