/**
 * Internal Agent API , called by the gateway when a team member sends an SMS/WhatsApp.
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
import { handleApiError } from "@/lib/api/errors";
import { executeAgentTurn } from "@/lib/agent/api/execution";
import { resolveInternalAgentThread } from "@/lib/agent/api/internal";
import { parseAgentInternalBody } from "@/lib/agent/api/validation";
import { timingSafeIncludes, getValidInternalSecrets } from "@/lib/server/auth-utils";
import { recordAgentRouteFailure } from "@/lib/server/agent-failure-alerts";
import { getRedis } from "@/lib/server/redis";
import { assertBillingWriteAllowedForOrgId } from "@/lib/billing/write-gate";
import { resolveClerkUserApprover } from "@/lib/agent/api/approver";
import { formatApproverId } from "@/lib/agent/api/plan-execution";
import { hashInstruction } from "@/lib/agent/api/agent-actions";
import logger from "@/lib/server/logger";

export async function POST(request: Request) {
  let orgId: string | null = null;

  try {
    // Authenticate via shared secret (supports rotation via INTERNAL_API_SECRET_PREV)
    const secret = request.headers.get("x-internal-secret");
    if (!secret || !timingSafeIncludes(getValidInternalSecrets(), secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId: parsedOrgId, instruction, orderNumber, senderPhone, clerkUserId, threadId, approvedToolCalls } =
      parseAgentInternalBody(await request.json());
    orgId = parsedOrgId;
    await assertBillingWriteAllowedForOrgId(parsedOrgId);

    const resolvedThread = await resolveInternalAgentThread({
      orgId: parsedOrgId,
      threadId,
      orderNumber,
      senderPhone,
    });
    const resolvedThreadId = resolvedThread.id;

    const approver = approvedToolCalls?.length
      ? await resolveClerkUserApprover(clerkUserId)
      : undefined;

    const isOperatorThread =
      resolvedThread.channelType === "sms_agent" || resolvedThread.channelType === "dashboard_agent";
    const persistOperatorExchange = isOperatorThread && !approvedToolCalls?.length;

    const result = await executeAgentTurn({
      orgId: parsedOrgId,
      threadId: resolvedThreadId,
      instruction,
      failureRoute: "/api/agent/internal",
      approvedToolCalls,
      ...(persistOperatorExchange ? { persistUserMessage: true, persistAgentMessage: true } : {}),
      persistAuditNote: true,
      ...(approvedToolCalls?.length ? { auditMode: "human_approved" as const } : {}),
      ...(approver ? {
        approval: {
          approverId: formatApproverId(approver),
          approvedAt: new Date(),
          instructionHash: hashInstruction(instruction),
        },
      } : {}),
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

    await recordAgentRouteFailure({
      route: "/api/agent/internal",
      orgId,
      error,
    }, {
      getCounterClient: getRedis,
      onError: (alertError) => {
        logger.error({ err: alertError }, "[agent/internal] failure alert error");
      },
    });

    return handleApiError(error, "Agent internal POST", "Failed to run agent");
  }
}
