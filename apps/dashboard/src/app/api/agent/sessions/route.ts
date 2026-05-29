/**
 * GET  /api/agent/sessions , list past dashboard_agent sessions for this user
 * DELETE /api/agent/sessions , delete all sessions for this user
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { UnauthorizedError } from "@/lib/api/errors";
import { withOrgRoute } from "@/lib/api/route";
import {
  archiveDashboardAgentSessions,
  listDashboardAgentSessions,
} from "@/lib/agent/api/sessions";

export const GET = withOrgRoute(
  { context: "GET /api/agent/sessions", errorMessage: "Failed to fetch sessions" },
  async ({ org }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();
    const sessions = await listDashboardAgentSessions(org.id, userId);
    return NextResponse.json(sessions);
  },
);

export const DELETE = withOrgRoute(
  { context: "DELETE /api/agent/sessions", errorMessage: "Failed to clear sessions" },
  async ({ org }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();
    await archiveDashboardAgentSessions(org.id, userId);
    return NextResponse.json({ ok: true });
  },
);
