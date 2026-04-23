/**
 * GET  /api/agent/sessions — list past dashboard_agent sessions for this user
 * DELETE /api/agent/sessions — delete all sessions for this user
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateOrg } from "@/lib/server/org";
import { handleApiError } from "@/lib/api/errors";
import {
  archiveDashboardAgentSessions,
  listDashboardAgentSessions,
} from "@/lib/agent/api/sessions";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await getOrCreateOrg();
    const sessions = await listDashboardAgentSessions(org.id, userId);

    return NextResponse.json(sessions);
  } catch (error) {
    return handleApiError(error, "GET /api/agent/sessions", "Failed to fetch sessions");
  }
}

export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await getOrCreateOrg();
    await archiveDashboardAgentSessions(org.id, userId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/agent/sessions", "Failed to clear sessions");
  }
}
