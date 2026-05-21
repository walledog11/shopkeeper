import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

// GET /api/org/data?action=export
export const GET = withOrgRoute(
  {
    context: 'Org Data GET',
    errorMessage: 'Failed to export data',
    rateLimit: { key: 'org:data:export', limit: 4, windowSecs: 3600 },
  },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action !== 'export') {
      throw new BadRequestError('Unknown action');
    }

    const [customers, threads, kbArticles, cannedResponses] = await Promise.all([
      db.customer.findMany({
        where: { organizationId: org.id, deletedAt: null },
        select: { id: true, name: true, platformId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.thread.findMany({
        where: { organizationId: org.id, deletedAt: null },
        select: {
          id: true,
          customerId: true,
          channelType: true,
          status: true,
          subject: true,
          tag: true,
          aiSummary: true,
          createdAt: true,
          lastMessageAt: true,
          archivedAt: true,
          messages: {
            where: { deletedAt: null },
            select: { id: true, senderType: true, contentText: true, sentAt: true, attachments: true },
            orderBy: { sentAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.kbArticle.findMany({
        where: { organizationId: org.id },
        select: { id: true, title: true, body: true, tags: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.cannedResponse.findMany({
        where: { organizationId: org.id },
        select: { id: true, title: true, body: true, tags: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      workspace: { id: org.id, name: org.name, settings: org.settings ?? {} },
      customers,
      threads,
      kbArticles,
      cannedResponses,
    };

    const slug = org.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'workspace';
    const filename = `clerk-export-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  },
);

// DELETE /api/org/data?action=clear_tickets
export const DELETE = withOrgRoute(
  {
    context: 'Org Data DELETE',
    errorMessage: 'Failed to perform action',
    rateLimit: { key: 'org:data:delete', limit: 2, windowSecs: 3600 },
  },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'clear_tickets') {
      await db.thread.updateMany({ where: { organizationId: org.id }, data: { archivedAt: new Date() } });
      return NextResponse.json({ ok: true });
    }

    throw new BadRequestError('Unknown action');
  },
);
