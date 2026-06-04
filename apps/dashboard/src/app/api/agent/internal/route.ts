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
import { withInternalRoute } from "@/lib/api/internal-route";
import { executeAgentTurn } from "@/lib/agent/api/execution";
import { resolveInternalAgentThread } from "@/lib/agent/api/internal";
import { parseAgentInternalBody } from "@/lib/agent/api/validation";
import { recordAgentRouteFailure } from "@/lib/server/agent-failure-alerts";
import { getRedis } from "@/lib/server/redis";
import { assertBillingWriteAllowedForOrgId } from "@/lib/billing/write-gate";
import { resolveClerkUserApprover } from "@/lib/agent/api/approver";
import { isOperatorChannel } from "@/lib/messaging/thread-constants";
import { formatApproverId } from "@/lib/agent/api/plan-execution";
import { hashInstruction } from "@/lib/agent/api/agent-actions";
import logger from "@/lib/server/logger";

interface AgentInternalRouteState {
  orgId: string | null;
}

export const POST = withInternalRoute<AgentInternalRouteState>(
  {
    context: "Agent internal POST",
    errorMessage: "Failed to run agent",
    createState: () => ({ orgId: null }),
    onError: async (error, state) => {
      logger.error({ err: error }, "[agent/internal] error");

      await recordAgentRouteFailure({
        route: "/api/agent/internal",
        orgId: state.orgId,
        error,
      }, {
        getCounterClient: getRedis,
        onError: (alertError) => {
          logger.error({ err: alertError }, "[agent/internal] failure alert error");
        },
      });
    },
  },
  async ({ request, state }) => {
    const { orgId: parsedOrgId, instruction, orderNumber, senderPhone, clerkUserId, threadId, approvedToolCalls } =
      parseAgentInternalBody(await request.json());
    state.orgId = parsedOrgId;
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

    const persistOperatorExchange = isOperatorChannel(resolvedThread.channelType) && !approvedToolCalls?.length;

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
  },
);
