import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { BadRequestError, UnauthorizedError } from "@/lib/api/errors";
import { withOrgRoute } from "@/lib/api/route";
import { postGatewayAgentRequestCancel } from "@/lib/agent/api/gateway-operator-turn";

// Records the stop; it never waits for the running attempt to notice.
export const POST = withOrgRoute<{ requestId: string }>(
  { context: "Agent request cancel", errorMessage: "Failed to cancel agent request" },
  async ({ org, params, request }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();
    const body = (await request.json().catch(() => null)) as { taskRevision?: unknown } | null;
    if (typeof body?.taskRevision !== "number") {
      throw new BadRequestError("taskRevision is required");
    }
    const { status, payload } = await postGatewayAgentRequestCancel({
      organizationId: org.id,
      clerkUserId: userId,
      requestId: params.requestId,
      taskRevision: body.taskRevision,
    });
    return NextResponse.json(payload ?? { error: "Failed to cancel agent request" }, { status });
  },
);
