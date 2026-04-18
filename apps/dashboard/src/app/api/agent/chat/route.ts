/**
 * Dashboard Agent Chat API
 *
 * Clerk-auth'd endpoint for the standalone /dashboard/agent page.
 * Bootstraps a dashboard_agent session on first message, then reuses it.
 *
 * Body:    { instruction: string, sessionId?: string }
 * Response: { sessionId: string, summary: string, actionsPerformed: ActionEntry[] }
 */
import { NextResponse } from "next/server";

export const maxDuration = 60;
import { auth } from "@clerk/nextjs/server";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";
import { executeAgentTurn } from "@/lib/agent/api/execution";
import {
  createDashboardAgentSession,
  resolveDashboardAgentSession,
} from "@/lib/agent/api/sessions";
import { parseAgentChatBody } from "@/lib/agent/api/validation";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import type { OrgSettings } from "@/types";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getOrCreateOrg();

    const rl = await rateLimit(`agent:chat:${org.id}`, 10, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { instruction, sessionId } = parseAgentChatBody(await request.json());

    let resolvedSessionId: string;

    if (sessionId) {
      resolvedSessionId = (await resolveDashboardAgentSession(org.id, userId, sessionId)).id;
    } else {
      const thread = await createDashboardAgentSession(org.id, userId);
      resolvedSessionId = thread.id;
    }

    const result = await executeAgentTurn({
      orgId: org.id,
      threadId: resolvedSessionId,
      instruction,
      orgSettings: org.settings as Partial<OrgSettings> | null,
      persistUserMessage: true,
      persistAgentMessage: true,
      persistAuditNote: true,
      persistAuditNoteWhenNoActions: false,
    });

    return NextResponse.json({
      sessionId: resolvedSessionId,
      summary: result.summary,
      actionsPerformed: result.actionsPerformed,
    });
  } catch (error) {
    logger.error({ err: error }, "[agent/chat] error");
    return handleApiError(error, "Agent chat POST", "Failed to run agent");
  }
}
