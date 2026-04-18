/**
 * Internal Agent API — called by the gateway when a team member sends an SMS/WhatsApp.
 *
 * Auth: x-internal-secret header (shared secret between gateway and dashboard).
 * No Clerk session required.
 *
 * Body: { orgId, instruction, orderNumber?, senderPhone?, clerkUserId?, threadId?, approvedToolCalls? }
 *
 * When threadId is provided, order resolution is skipped and the thread is used directly.
 * When approvedToolCalls is provided, it is passed to runAgent() to execute a pre-approved plan.
 *
 * Response: { summary, actionsPerformed, threadId }
 */
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-errors";
import { executeAgentTurn } from "@/lib/agent/api/execution";
import { resolveInternalAgentThread } from "@/lib/agent/api/internal";
import { parseAgentInternalBody } from "@/lib/agent/api/validation";
import { timingSafeIncludes, getValidInternalSecrets } from "@/lib/auth-utils";
import logger from "@/lib/logger";

export async function POST(request: Request) {
  try {
    // Authenticate via shared secret (supports rotation via INTERNAL_API_SECRET_PREV)
    const secret = request.headers.get("x-internal-secret");
    if (!secret || !timingSafeIncludes(getValidInternalSecrets(), secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId, instruction, orderNumber, senderPhone, clerkUserId, threadId, approvedToolCalls } =
      parseAgentInternalBody(await request.json());

    const resolvedThreadId = (
      await resolveInternalAgentThread({
        orgId,
        threadId,
        orderNumber,
        senderPhone,
      })
    ).id;

    const result = await executeAgentTurn({
      orgId,
      threadId: resolvedThreadId,
      instruction,
      approvedToolCalls,
      persistAuditNote: true,
      auditMetadata: {
        senderPhone,
        clerkUserId,
      },
    });

    return NextResponse.json({
      summary: result.summary,
      actionsPerformed: result.actionsPerformed,
      threadId: resolvedThreadId,
    });
  } catch (error) {
    logger.error({ err: error }, "[agent/internal] error");
    return handleApiError(error, "Agent internal POST", "Failed to run agent");
  }
}
