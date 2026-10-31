import { NextResponse } from 'next/server';
import { NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { loadTicketTimeline } from '@/lib/server/ticket-timeline';

export const GET = withOrgRoute<{ id: string }>(
  { context: 'Thread timeline GET', errorMessage: 'Failed to build ticket timeline' },
  async ({ org, params }) => {
    const timeline = await loadTicketTimeline(org.id, params.id);
    if (timeline === null) throw new NotFoundError('Thread not found');
    return new NextResponse(timeline, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
);
