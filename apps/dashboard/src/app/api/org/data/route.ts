import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';

// GET /api/org/data?action=export
export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`org:data:export:${org.id}`, 4, 3600);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action !== 'export') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
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
  } catch (error) {
    return handleApiError(error, 'Org Data GET', 'Failed to export data');
  }
}

// DELETE /api/org/data?action=clear_tickets
export async function DELETE(request: Request) {
  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`org:data:delete:${org.id}`, 2, 3600);
    if (!rl.success) return tooManyRequests(rl.reset);
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'clear_tickets') {
      await db.thread.updateMany({ where: { organizationId: org.id }, data: { archivedAt: new Date() } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return handleApiError(error, 'Org Data DELETE', 'Failed to perform action');
  }
}
