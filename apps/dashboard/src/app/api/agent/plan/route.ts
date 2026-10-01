import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { BadRequestError, UnauthorizedError } from "@/lib/api/errors";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { requireOrgThread } from "@shopkeeper/agent/thread-auth";
import { dismissCurrentCachedPlan } from "@shopkeeper/agent/plan-execution";
import { parseAgentPlanBody, parseAgentPlanDismissBody } from "@/lib/agent/api/validation";
import { listGatewayAgentRequests, postGatewayPlanRequest } from "@/lib/agent/api/gateway-operator-turn";

export const maxDuration = 60;

export const GET = withOrgRoute(
  { context: "Agent plan GET", errorMessage: "Failed to load planning request" },
  async ({ org, request }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();
    const threadId = new URL(request.url).searchParams.get("threadId");
    if (!threadId) throw new BadRequestError("threadId is required");
    await requireOrgThread(threadId, org.id);
    const { status, payload } = await listGatewayAgentRequests({ organizationId: org.id, clerkUserId: userId, threadId });
    return NextResponse.json(payload ?? { error: "Failed to load planning request" }, { status });
  },
);

export const POST = withOrgRoute(
  {
    context: "Agent plan POST", errorMessage: "Failed to generate plan",
    requireBillingWriteAllowed: true,
    rateLimit: { key: "agent:plan", limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();
    const body = parseAgentPlanBody(await readRequiredJsonObject(request));
    await requireOrgThread(body.threadId, org.id);
    const { status, payload } = await postGatewayPlanRequest({ organizationId: org.id, clerkUserId: userId, ...body });
    if (status >= 500) throw new Error(`Gateway planning request failed with ${status}`);
    return NextResponse.json(payload ?? { error: "Failed to accept planning request" }, { status });
  },
);

export const DELETE = withOrgRoute(
  {
    context: "Agent plan DELETE",
    errorMessage: "Failed to dismiss plan",
    requireBillingWriteAllowed: true,
    rateLimit: { key: "agent:plan-dismiss", limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { threadId, planId } = parseAgentPlanDismissBody(await readRequiredJsonObject(request));
    // The dismissing member, for the durable proposal's own scope check.
    // `getOrCreateOrg` has already established a signed-in session, so a missing
    // user here is a broken one rather than an anonymous caller.
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();
    const cleared = await dismissCurrentCachedPlan({
      orgId: org.id,
      threadId,
      expectedPlanId: planId,
      clerkUserId: userId,
    });
    // A card the merchant is dismissing can already be gone — the reply was sent,
    // or a newer customer message replaced the plan. The card is stale either way
    // and the client refetches, so this is a no-op, not something to escalate at
    // them. A plan mid-execution still throws, from dismissCurrentCachedPlan.
    return NextResponse.json({ ok: true, dismissed: cleared });
  },
);
