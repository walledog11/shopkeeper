import { NextResponse } from "next/server";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { requireCurrentUserId } from "@/lib/api/permissions";
import { requireOrgThread } from "@shopkeeper/agent/thread-auth";
import { parseAgentAnswerBody } from "@/lib/agent/api/validation";
import { postGatewayAnswer } from "@/lib/agent/api/gateway-operator-turn";

export const maxDuration = 60;

// The merchant has answered an `ask_operator` question. The gateway records it,
// optionally saves it to the knowledge base, and re-plans the ticket through the
// same continuation a phone answer takes, so the new card is parked and pushed
// to every bound channel rather than only appearing here.
export const POST = withOrgRoute(
  {
    context: "Agent answer POST",
    errorMessage: "Failed to record answer",
    requireBillingWriteAllowed: true,
    rateLimit: { key: "agent:answer", limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const userId = await requireCurrentUserId();
    const { threadId, answer, saveToKb } = parseAgentAnswerBody(await readRequiredJsonObject(request));
    await requireOrgThread(threadId, org.id);
    const { status, payload } = await postGatewayAnswer({
      organizationId: org.id, clerkUserId: userId, threadId, answer, saveToKb,
    });
    if (status >= 500 && status !== 502) throw new Error(`Gateway answer failed with ${status}`);
    return NextResponse.json(payload ?? { error: "Failed to record answer" }, { status });
  },
);
