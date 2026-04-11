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
    const rl = await rateLimit(`threads:get:${org.id}`, 60, 60);
    if (!rl.success) return tooManyRequests(rl.reset);
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || 'open') as 'open' | 'closed';
    const preview = searchParams.get('preview') === 'true';
    const cursor = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = !isNaN(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : undefined;

    const rows = await db.thread.findMany({
      where: {
        organizationId: org.id,
        status,
        channelType: { notIn: [CHANNEL_TYPE.SMS_AGENT, CHANNEL_TYPE.DASHBOARD_AGENT] },
        archivedAt: null,
        deletedAt: null,
      },
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
      orderBy: { updatedAt: 'desc' },
    });

    let threads = rows;
    let nextCursor: string | null = null;
    if (limit !== undefined && rows.length > limit) {
      threads = rows.slice(0, limit);
      nextCursor = threads[threads.length - 1].id;
    }

    return NextResponse.json({ threads, nextCursor });

  } catch (error) {
    return handleApiError(error, 'Threads GET', 'Failed to fetch threads');
  }
}
