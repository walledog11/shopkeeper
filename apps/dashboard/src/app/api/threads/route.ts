import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || 'open') as 'open' | 'closed';

    const threads = await db.thread.findMany({
      where: {
        organizationId: org.id,
        status,
      },
      include: {
        customer: true,
        messages: {
          orderBy: { sentAt: 'asc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json(threads);

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Next.js API] Failed to fetch threads:', error);
    return NextResponse.json({ error: 'Failed to fetch threads from database' }, { status: 500 });
  }
}
