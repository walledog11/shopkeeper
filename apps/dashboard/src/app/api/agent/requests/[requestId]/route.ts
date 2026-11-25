import { NextResponse } from "next/server";
import { withOrgRoute } from "@/lib/api/route";
import { requireCurrentUserId } from "@/lib/api/permissions";
import { getGatewayAgentRequest } from "@/lib/agent/api/gateway-operator-turn";

export const GET = withOrgRoute<{ requestId: string }>(
  {
    context: "Agent request GET",
    errorMessage: "Failed to load agent request",
    customerData: { resource: "agent_request", idParam: "requestId" },
  },
  async ({ org, params }) => {
    const userId = await requireCurrentUserId();
    const { status, payload } = await getGatewayAgentRequest({
      organizationId: org.id,
      clerkUserId: userId,
      requestId: params.requestId,
    });
    return NextResponse.json(payload ?? { error: "Failed to load agent request" }, { status });
  },
);
