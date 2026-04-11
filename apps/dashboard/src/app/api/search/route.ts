import { NextResponse } from 'next/server';
import { db, SenderType } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { CHANNEL_TYPE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const rl = await rateLimit(`search:${org.id}`, 30, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() ?? '';

    if (q.length < 2) {
      return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
    }

    const threads = await db.thread.findMany({
      where: {
        organizationId: org.id,
        channelType: { notIn: [CHANNEL_TYPE.SMS_AGENT, CHANNEL_TYPE.DASHBOARD_AGENT] },
        archivedAt: null,
        deletedAt: null,
        OR: [
          { customer: { name: { contains: q, mode: 'insensitive' } } },
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
  } catch (error) {
    return handleApiError(error, 'Search GET', 'Failed to perform search');
  }
}
