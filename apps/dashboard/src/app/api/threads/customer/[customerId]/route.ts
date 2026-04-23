import { NextResponse } from 'next/server';
import { db, SenderType } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';
import { CHANNEL_TYPE } from '@/lib/messaging/thread-constants';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
    const org = await getOrCreateOrg();
    const rl = await rateLimit(`customer-threads:${org.id}`, 60, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { customerId } = await params;

    const threads = await db.thread.findMany({
      where: {
        customerId,
        organizationId: org.id,
        channelType: { notIn: [CHANNEL_TYPE.SMS_AGENT, CHANNEL_TYPE.DASHBOARD_AGENT] },
        archivedAt: null,
        deletedAt: null,
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
    });

    return NextResponse.json({ threads });
  } catch (error) {
    return handleApiError(error, 'Customer threads GET', 'Failed to fetch customer threads');
  }
}
