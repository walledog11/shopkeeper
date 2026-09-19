import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { UnauthorizedError } from "@/lib/api/errors";
import { withOrgRoute } from "@/lib/api/route";
import { getGatewayAgentRequest } from "@/lib/agent/api/gateway-operator-turn";

export const GET = withOrgRoute<{ requestId: string }>(
  { context: "Agent request GET", errorMessage: "Failed to load agent request" },
  async ({ org, params }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();
    const { status, payload } = await getGatewayAgentRequest({
      organizationId: org.id,
      clerkUserId: userId,
      requestId: params.requestId,
    });
    return NextResponse.json(payload ?? { error: "Failed to load agent request" }, { status });
  },
);
