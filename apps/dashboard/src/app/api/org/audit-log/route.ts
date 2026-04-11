import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { SENDER_TYPE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const LIMIT = 50;

export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const rl = await rateLimit(`audit-log:${org.id}`, 60, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') ?? undefined;
    const format = searchParams.get('format');
    const isCsv = format === 'csv';

    const rows = await db.message.findMany({
      where: {
        senderType: { in: [SENDER_TYPE.AI, SENDER_TYPE.NOTE] },
        deletedAt: null,
        thread: { organizationId: org.id },
      },
      include: {
        thread: {
          select: {
            id: true,
            channelType: true,
            customer: { select: { name: true, platformId: true } },
          },
        },
      },
      orderBy: { sentAt: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: isCsv ? LIMIT : LIMIT + 1,
    });

    if (isCsv) {
      const header = 'timestamp,customer,channel,type,content\n';
      const body = rows
        .map(row => {
          const customer =
            row.thread.customer?.name ??
            row.thread.customer?.platformId ??
            'Unknown';
          const content = (row.contentText ?? '').replace(/"/g, '""');
          return `"${row.sentAt.toISOString()}","${customer}","${row.thread.channelType}","${row.senderType}","${content}"`;
        })
        .join('\n');

      return new NextResponse(header + body, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-log-${Date.now()}.csv"`,
        },
      });
    }

    let entries = rows;
    let nextCursor: string | null = null;
    if (rows.length > LIMIT) {
      entries = rows.slice(0, LIMIT);
      nextCursor = entries[entries.length - 1].id;
    }

    return NextResponse.json({ entries, nextCursor });
  } catch (error) {
    return handleApiError(error, 'Audit log GET', 'Failed to fetch audit log');
  }
}
