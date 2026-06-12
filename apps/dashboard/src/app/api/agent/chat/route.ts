/**
 * Dashboard Agent Chat API
 *
 * Clerk-auth'd endpoint for the dashboard desk chat panel.
 * Bootstraps a dashboard_agent session on first message, then reuses it.
 *
 * Body:    { instruction: string, sessionId?: string }
 * Response: { sessionId: string, summary: string, actionsPerformed: ActionEntry[] }
 */
import { NextResponse } from "next/server";

export const maxDuration = 60;
import { db } from "@shopkeeper/db";
import { auth } from "@clerk/nextjs/server";
import { UnauthorizedError } from "@/lib/api/errors";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { executeAgentTurn } from "@/lib/agent/api/execution";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import {
  buildRevisedDashboardInstruction,
  clearDashboardPendingApproval,
  dismissDashboardPendingApproval,
  getDashboardActionCalls,
  getDashboardApprovalReplyKind,
  planDashboardApproval,
  readDashboardPendingApproval,
  shouldPlanBeforeExecuting,
} from "@/lib/agent/api/dashboard-approval";
import { createDashboardAgentSession, resolveDashboardAgentSession } from "@/lib/agent/api/sessions";
import { parseAgentChatBody } from "@/lib/agent/api/validation";
import { recordAgentRouteFailure } from "@/lib/server/agent-failure-alerts";
import { getRedis } from "@/lib/server/redis";
import logger from "@/lib/server/logger";
import type { OrgSettings } from "@/types";

function dashboardActionResponse(
  sessionId: string,
  planned: Awaited<ReturnType<typeof planDashboardApproval>>,
): NextResponse | null {
  if (!planned) return null;

  if ("autoExecuted" in planned) {
    return NextResponse.json({
      sessionId,
      summary: planned.result.summary,
      actionsPerformed: planned.result.actionsPerformed,
      autoExecuted: true,
    });
  }

  return NextResponse.json({
    sessionId,
    summary: planned.approval.summary,
    actionsPerformed: [],
    awaitingApproval: true,
  });
}

export const POST = withOrgRoute(
  {
    context: "Agent chat POST",
    errorMessage: "Failed to run agent",
    requireBillingWriteAllowed: true,
    rateLimit: { key: "agent:chat", limit: 10, windowSecs: 60 },
    onError: async (error, orgId) => {
      logger.error({ err: error }, "[agent/chat] error");
      await recordAgentRouteFailure({
        route: "/api/agent/chat",
        orgId,
        error,
      }, {
        getCounterClient: getRedis,
        onError: (alertError) => {
          logger.error({ err: alertError }, "[agent/chat] failure alert error");
        },
      });
    },
  },
  async ({ org, request }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();

    const { instruction, sessionId } = parseAgentChatBody(await readRequiredJsonObject(request));
    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);

    let resolvedSessionId: string;

    if (sessionId) {
      resolvedSessionId = (await resolveDashboardAgentSession(org.id, userId, sessionId)).id;
    } else {
      const thread = await createDashboardAgentSession(org.id, userId);
      resolvedSessionId = thread.id;
    }

    const thread = await db.thread.findUnique({
      where: { id: resolvedSessionId },
      select: { cachedPlan: true },
    });
    const pendingApproval = readDashboardPendingApproval(thread?.cachedPlan);

    if (pendingApproval) {
      const replyKind = getDashboardApprovalReplyKind(instruction);
      if (replyKind === "approve") {
        const result = await executeAgentTurn({
          orgId: org.id,
          threadId: resolvedSessionId,
          instruction,
          failureRoute: "/api/agent/chat",
          orgSettings: settings,
          approvedToolCalls: getDashboardActionCalls(pendingApproval.plan),
          persistUserMessage: true,
          persistAgentMessage: true,
          persistAuditNote: true,
          persistAuditNoteWhenNoActions: false,
          auditMode: "human_approved",
        });
        await clearDashboardPendingApproval(resolvedSessionId);

        return NextResponse.json({
          sessionId: resolvedSessionId,
          summary: result.summary,
          actionsPerformed: result.actionsPerformed,
        });
      }

      if (replyKind === "dismiss") {
        const summary = await dismissDashboardPendingApproval(resolvedSessionId, instruction);
        return NextResponse.json({
          sessionId: resolvedSessionId,
          summary,
          actionsPerformed: [],
        });
      }

      const revisedInstruction = buildRevisedDashboardInstruction(pendingApproval, instruction);
      const revised = await planDashboardApproval({
        orgId: org.id,
        threadId: resolvedSessionId,
        instruction: revisedInstruction,
        displayInstruction: instruction,
        settings,
      });

      if (revised && "autoExecuted" in revised) {
        await clearDashboardPendingApproval(resolvedSessionId);
      }

      const response = dashboardActionResponse(resolvedSessionId, revised);
      if (response) return response;

      await clearDashboardPendingApproval(resolvedSessionId);
    }

    if (shouldPlanBeforeExecuting(instruction, settings)) {
      const planned = await planDashboardApproval({
        orgId: org.id,
        threadId: resolvedSessionId,
        instruction,
        settings,
      });

      const response = dashboardActionResponse(resolvedSessionId, planned);
      if (response) return response;
    }

    const result = await executeAgentTurn({
      orgId: org.id,
      threadId: resolvedSessionId,
      instruction,
      failureRoute: "/api/agent/chat",
      orgSettings: settings,
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
  },
);
