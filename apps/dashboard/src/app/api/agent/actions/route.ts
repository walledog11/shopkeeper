/**
 * GET /api/agent/actions
 *
 * Returns a paginated action log of agent turns reconstructed from the
 * AgentAction audit table.
 *
 * Query params:
 *   cursor — encoded cursor for pagination
 *   format=csv — stream the full action log as CSV
 *
 * Response: { entries: ActionLogEntry[], nextCursor: string | null }
 */
import { NextResponse } from "next/server";
import { withOrgRoute } from "@/lib/api/route";
import {
  listAgentActionLogEntries,
  streamAgentActionLogCsv,
} from "@/lib/agent/api/action-log";
import { parseActionLogCursorQuery } from "@/lib/agent/api/validation";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export const GET = withOrgRoute(
  { context: "GET /api/agent/actions", errorMessage: "Failed to fetch action log" },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");

    const rl = await rateLimit(
      format === "csv" ? `agent-actions:export:${org.id}` : `agent-actions:${org.id}`,
      format === "csv" ? 5 : 60,
      60,
    );
    if (!rl.success) {
      return tooManyRequests(rl.reset);
    }

    const { cursor, filters } = parseActionLogCursorQuery(request);

    if (format === "csv") {
      const body = streamAgentActionLogCsv({ orgId: org.id, filters });
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="agent-actions-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const { entries, nextCursor } = await listAgentActionLogEntries({
      orgId: org.id,
      cursor,
      filters,
    });

    return NextResponse.json({ entries, nextCursor });
  },
);
