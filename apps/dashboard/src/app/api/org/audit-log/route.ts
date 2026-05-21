import { NextResponse } from 'next/server';
import { withOrgRoute } from '@/lib/api/route';
import {
  listAgentActionLogEntries,
  listAllAgentActionLogEntries,
  serializeAgentActionLogCsv,
} from '@/lib/agent/api/action-log';
import { parseActionLogCursorQuery } from '@/lib/agent/api/validation';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

// Legacy alias for the Settings audit log. The canonical structured source is /api/agent/actions.
export const GET = withOrgRoute(
  { context: 'Audit log GET', errorMessage: 'Failed to fetch audit log' },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    const rl = await rateLimit(
      format === 'csv' ? `audit-log:export:${org.id}` : `audit-log:${org.id}`,
      format === 'csv' ? 5 : 60,
      60,
    );
    if (!rl.success) return tooManyRequests(rl.reset);

    if (format === 'csv') {
      const entries = await listAllAgentActionLogEntries({ orgId: org.id });
      const csv = serializeAgentActionLogCsv(entries);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const { cursor } = parseActionLogCursorQuery(request);
    const { entries, nextCursor } = await listAgentActionLogEntries({
      orgId: org.id,
      cursor,
    });

    return NextResponse.json({ entries, nextCursor });
  },
);
