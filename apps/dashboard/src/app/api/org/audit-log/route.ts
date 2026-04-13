import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { SENDER_TYPE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const CSV_BATCH = 500;

export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const rl = await rateLimit(`audit-log:${org.id}`, 60, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') ?? undefined;
    const format = searchParams.get('format');
    const isCsv = format === 'csv';

    if (isCsv) {
      // Stream all records in batches — no arbitrary row cap
      const where = {
        senderType: { in: [SENDER_TYPE.AI, SENDER_TYPE.NOTE] as string[] },
        deletedAt: null,
        thread: { organizationId: org.id },
      };
      const include = {
        thread: {
          select: {
            id: true,
            channelType: true,
            customer: { select: { name: true, platformId: true } },
          },
        },
      } as const;

      let csvCursor: string | undefined;
      const lines: string[] = ['timestamp,customer,channel,type,content'];

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await db.message.findMany({
          where,
          include,
          orderBy: { sentAt: 'desc' },
          ...(csvCursor ? { cursor: { id: csvCursor }, skip: 1 } : {}),
          take: CSV_BATCH,
        });

        for (const row of batch) {
          const customer =
            row.thread.customer?.name ??
            row.thread.customer?.platformId ??
            'Unknown';
          const content = (row.contentText ?? '').replace(/"/g, '""');
          lines.push(`"${row.sentAt.toISOString()}","${customer}","${row.thread.channelType}","${row.senderType}","${content}"`);
        }

        if (batch.length < CSV_BATCH) break;
        csvCursor = batch[batch.length - 1].id;
      }

      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-log-${Date.now()}.csv"`,
        },
      });
    }

    const rows = await db.message.findMany({
      where: {
        senderType: { in: [SENDER_TYPE.AI, SENDER_TYPE.NOTE] as string[] },
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
      take: PAGE_SIZE + 1,
    });

    let entries = rows;
    let nextCursor: string | null = null;
    if (rows.length > PAGE_SIZE) {
      entries = rows.slice(0, PAGE_SIZE);
      nextCursor = entries[entries.length - 1].id;
    }

    return NextResponse.json({ entries, nextCursor });
  } catch (error) {
    return handleApiError(error, 'Audit log GET', 'Failed to fetch audit log');
  }
}
