/**
 * GET /api/agent/actions
 *
 * Returns a paginated action log of all agent turns across all threads for this org.
 * Reads __clerk_agent__ note messages and filters to entries with at least one action.
 *
 * Query params:
 *   cursor — ISO timestamp (sentAt) for cursor-based pagination
 *
 * Response: { entries: ActionLogEntry[], nextCursor: string | null }
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";
import { listAgentActionLogEntries } from "@/lib/agent/api/action-log";
import { parseActionLogCursorQuery } from "@/lib/agent/api/validation";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await getOrCreateOrg();
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
