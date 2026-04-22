import { NextResponse } from 'next/server';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';
import {
  listAgentActionLogEntries,
  listAllAgentActionLogEntries,
  serializeAgentActionLogCsv,
} from '@/lib/agent/api/action-log';
import { parseActionLogCursorQuery } from '@/lib/agent/api/validation';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Legacy alias for the Settings audit log. The canonical structured source is /api/agent/actions.
export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg();
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
  } catch (error) {
    return handleApiError(error, 'Audit log GET', 'Failed to fetch audit log');
  }
}
