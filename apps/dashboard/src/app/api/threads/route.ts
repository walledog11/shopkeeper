import { NextResponse } from 'next/server';
import { db, Prisma, ThreadFilterStatus } from '@shopkeeper/db';
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
    rateLimit: { key: 'threads:get', limit: 60, windowSecs: 60, scope: 'user' },
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
    } = parseThreadListQuery(searchParams);
    const wantsFiltered = filterStatus === ThreadFilterStatus.filtered;

    const sqlFilters = {
      wantsFiltered,
      status: wantsFiltered || status === 'all' ? undefined : status,
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

    // Nested Prisma `take` trims multi-thread relations in memory. Limit each
    // history in SQL; previews also retain the latest customer's question.
    const [rows, messageIds] = await Promise.all([
      db.thread.findMany({
        where: { organizationId: org.id, id: { in: ids } },
        include: { customer: true },
      }),
      db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT latest.id FROM unnest(ARRAY[${Prisma.join(ids)}]::uuid[]) AS selected(thread_id)
          CROSS JOIN LATERAL (
            (SELECT m.id FROM messages m
             WHERE m.organization_id = ${org.id}::uuid AND m.thread_id = selected.thread_id
               AND m.deleted_at IS NULL
               ${preview ? Prisma.sql`AND m.sender_type <> 'note'` : Prisma.empty}
             ORDER BY m.sent_at DESC, m.id DESC LIMIT ${preview ? 1 : 100})
            ${preview ? Prisma.sql`UNION
              (SELECT m.id FROM messages m
               WHERE m.organization_id = ${org.id}::uuid AND m.thread_id = selected.thread_id
                 AND m.sender_type = 'customer' AND m.deleted_at IS NULL
               ORDER BY m.sent_at DESC, m.id DESC LIMIT 1)` : Prisma.empty}
          ) latest
        `),
    ]);
    const messages = messageIds.length > 0
      ? await db.message.findMany({
          where: {
            organizationId: org.id,
            id: { in: messageIds.map(row => row.id) },
          },
          orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
        })
      : [];
    const messagesByThread = new Map<string, typeof messages>();
    for (const message of messages) {
      const history = messagesByThread.get(message.threadId) ?? [];
      history.push(message);
      messagesByThread.set(message.threadId, history);
    }

    const byId = new Map(rows.map(row => [row.id, row]));
    const threads = ids.flatMap((id: string) => {
      const thread = byId.get(id);
      if (!thread) return [];
      return [{ ...thread, messages: messagesByThread.get(id) ?? [] }];
    });

    return NextResponse.json({ threads, nextCursor, ...(totalCount !== undefined ? { totalCount } : {}) });
  },
);
