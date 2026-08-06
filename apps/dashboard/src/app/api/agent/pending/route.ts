/**
 * Operator pending-plan ledger.
 *
 * The panel's default state: what is waiting on the merchant right now, read off
 * the same per-person queue their phone's plan cards refer to. GET is polled
 * while the panel is open, so a plan approved on the phone stops being offered
 * here without a reload.
 *
 * GET   -> { plans: PendingPlanView[] }
 * POST  { planId, decision: "approve" | "dismiss" } -> { summary }
 */
import { NextResponse } from "next/server";

export const maxDuration = 60;
import { auth } from "@clerk/nextjs/server";
import { UnauthorizedError } from "@/lib/api/errors";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { postGatewayPlanDecision } from "@/lib/agent/api/gateway-operator-turn";
import { getOperatorPendingPlans } from "@/lib/agent/api/operator-pending";
import { parseAgentPlanDecisionBody } from "@/lib/agent/api/validation";
import { recordAgentRouteFailure } from "@/lib/server/agent-failure-alerts";
import { getRedis } from "@/lib/server/redis";
import logger from "@/lib/server/logger";

export const GET = withOrgRoute(
  { context: "Agent pending GET", errorMessage: "Failed to load pending plans" },
  async ({ org }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();
    return NextResponse.json({ plans: await getOperatorPendingPlans(org.id, userId) });
  },
);

export const POST = withOrgRoute(
  {
    context: "Agent pending POST",
    errorMessage: "Failed to record decision",
    requireBillingWriteAllowed: true,
    rateLimit: { key: "agent:pending", limit: 20, windowSecs: 60 },
    onError: async (error, orgId) => {
      logger.error({ err: error }, "[agent/pending] error");
      await recordAgentRouteFailure({
        route: "/api/agent/pending",
        orgId,
        error,
      }, {
        getCounterClient: getRedis,
        onError: (alertError) => {
          logger.error({ err: alertError }, "[agent/pending] failure alert error");
        },
      });
    },
  },
  async ({ org, request }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();

    const { planId, decision } = parseAgentPlanDecisionBody(await readRequiredJsonObject(request));

    const { status, payload } = await postGatewayPlanDecision({
      organizationId: org.id,
      clerkUserId: userId,
      planId,
      decision,
    });

    // A reached gateway's 4xx is the merchant's answer (409: someone already
    // resolved this plan). A 5xx is ours — throw so onError alerts.
    if (status >= 500) {
      throw new Error(`[agent/pending] gateway plan decision failed with ${status}`);
    }
    if (status !== 200) {
      return NextResponse.json(payload ?? { error: "Failed to record decision" }, { status });
    }

    return NextResponse.json({ summary: payload?.summary ?? "" });
  },
);
