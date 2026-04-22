/**
 * GET /api/agent/actions
 *
 * Returns a paginated action log of all agent turns across all threads for this org.
 * Reads structured __clerk_agent__ note messages and filters to entries with at least one action.
 *
 * Query params:
 *   cursor — encoded cursor for pagination
 *   format=csv — export the full action log as CSV
 *
 * Response: { entries: ActionLogEntry[], nextCursor: string | null }
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";
import {
  listAgentActionLogEntries,
  listAllAgentActionLogEntries,
  serializeAgentActionLogCsv,
} from "@/lib/agent/api/action-log";
import { parseActionLogCursorQuery } from "@/lib/agent/api/validation";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await getOrCreateOrg();
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

    if (format === "csv") {
      const entries = await listAllAgentActionLogEntries({ orgId: org.id });
      const csv = serializeAgentActionLogCsv(entries);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="agent-actions-${new Date().toISOString().slice(0, 10)}.csv"`,
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
    return handleApiError(error, "GET /api/agent/actions", "Failed to fetch action log");
  }
}
