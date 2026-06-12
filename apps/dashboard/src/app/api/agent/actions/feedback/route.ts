/**
 * POST /api/agent/actions/feedback
 *
 * Records merchant feedback on an agent turn ("good" or clears it). Applied to
 * every AgentAction row in the turn so the action log reads it turn-level.
 *
 * Body: { turnId: string, feedback: "good" | null }
 */
import { NextResponse } from "next/server";
import { db } from "@shopkeeper/db";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { parseAgentActionFeedbackBody } from "@/lib/agent/api/validation";

export const POST = withOrgRoute(
  {
    context: "POST /api/agent/actions/feedback",
    errorMessage: "Failed to record feedback",
    rateLimit: { key: "agent-actions:feedback", limit: 60, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { turnId, feedback } = parseAgentActionFeedbackBody(await readRequiredJsonObject(request));

    const { count } = await db.agentAction.updateMany({
      where: { organizationId: org.id, turnId },
      data: { feedback },
    });

    if (count === 0) {
      return NextResponse.json({ error: "Turn not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  },
);
