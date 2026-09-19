/**
 * Dashboard Agent Chat API
 *
 * Clerk-auth'd endpoint for the dashboard desk chat panel.
 *
 * The panel is a view of the merchant's one operator relationship, not a chat
 * session of its own: the turn runs on the gateway's operator path against the
 * durable operator thread their phone talks to, so module tools, the pending-state
 * ledger, and the control tools all apply, and an approval given here clears the
 * plan showing on their phone.
 *
 * POST  { clientRequestId, instruction }
 *       -> 202 { requestId, taskId, status, statusUrl }
 * GET   -> { messages: Array<{ role, text }> }  the thread so far
 */
import { NextResponse } from "next/server";

export const maxDuration = 60;
import { auth } from "@clerk/nextjs/server";
import { UnauthorizedError } from "@/lib/api/errors";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { listGatewayAgentRequests, postGatewayAgentRequest } from "@/lib/agent/api/gateway-operator-turn";
import { getOperatorTranscript } from "@/lib/agent/api/operator-transcript";
import { parseAgentChatBody } from "@/lib/agent/api/validation";
import { recordAgentRouteFailure } from "@/lib/server/agent-failure-alerts";
import { getRedis } from "@/lib/server/redis";
import logger from "@/lib/server/logger";

export const GET = withOrgRoute(
  { context: "Agent chat GET", errorMessage: "Failed to load conversation" },
  async ({ org }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();
    const [messages, recent] = await Promise.all([
      getOperatorTranscript(org.id, userId),
      listGatewayAgentRequests({ organizationId: org.id, clerkUserId: userId }).catch(() => null),
    ]);
    return NextResponse.json({
      messages,
      requests: recent?.status === 200 ? recent.payload?.requests ?? [] : [],
    });
  },
);

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

    const { clientRequestId, instruction } = parseAgentChatBody(await readRequiredJsonObject(request));

    const { status, payload } = await postGatewayAgentRequest({
      organizationId: org.id,
      clerkUserId: userId,
      clientRequestId,
      instruction,
    });

    // A reached gateway's 4xx already carries a merchant-readable reason (spend
    // cap, billing gate, validation) — pass it through. A 5xx is ours: throw so
    // the route's onError records the failure alert.
    if (status >= 500) {
      throw new Error(`[agent/chat] gateway operator turn failed with ${status}`);
    }
    if (status !== 202) {
      return NextResponse.json(payload ?? { error: "Failed to run agent" }, { status });
    }

    return NextResponse.json(payload, { status: 202 });
  },
);
