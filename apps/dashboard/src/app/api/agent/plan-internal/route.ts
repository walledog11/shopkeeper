/**
 * Internal Plan Generation API — called by the gateway worker when a new
 * thread event occurs and a WhatsApp notification needs to be sent.
 *
 * Auth: x-internal-secret header (shared secret between gateway and dashboard).
 * No Clerk session required.
 *
 * Body: { orgId, threadId }
 * Response: { plan, instruction }
 */
import { NextResponse } from "next/server";

export const maxDuration = 60;
import { db } from "@clerk/db";
import { requireOrgThread } from "@/lib/agent/api/auth";
import { buildAgentPlanCacheRecord, isAgentPlanCacheHit, readAgentPlanCache } from "@/lib/agent/api/plan-cache";
import { parseAgentPlanInternalBody } from "@/lib/agent/api/validation";
import { buildContext, planAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { BadRequestError, handleApiError } from "@/lib/api/errors";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { timingSafeIncludes, getValidInternalSecrets } from "@/lib/server/auth-utils";
import type { OrgSettings } from "@/types";

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-internal-secret");
    if (!secret || !timingSafeIncludes(getValidInternalSecrets(), secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId, threadId } = parseAgentPlanInternalBody(await readJsonBody(request));

    const rl = await rateLimit(`plan-internal:${orgId}`, 30, 60);
    if (!rl.success) {
      return tooManyRequests(rl.reset);
    }

    const thread = await requireOrgThread(threadId, orgId);

    const instruction =
      thread.aiSummary || "Handle this customer's latest request";

    const lastCustomerMessage = thread.messages[0] ?? null;
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const settings = resolveAgentSettings(
      org?.settings as Partial<OrgSettings> | null
    );

    const cached = readAgentPlanCache(thread.cachedPlan);
    if (lastCustomerMessage && isAgentPlanCacheHit({
      cache: cached,
      instruction,
      lastCustomerMessageId: lastCustomerMessage.id,
      settings,
    })) {
      return NextResponse.json({ plan: cached?.plan, instruction });
    }
    const ctx = await buildContext(threadId, orgId);
    const plan = await planAgent(ctx, instruction, settings);

    if (lastCustomerMessage) {
      await db.thread.update({
        where: { id: threadId },
        data: {
          cachedPlanMessageId: lastCustomerMessage.id,
          cachedPlan: buildAgentPlanCacheRecord({
            instruction,
            lastCustomerMessageId: lastCustomerMessage.id,
            settings,
            plan,
          }) as object,
        },
      });
    }

    return NextResponse.json({ plan, instruction });
  } catch (error) {
    return handleApiError(error, "Agent plan-internal POST", "Failed to generate plan");
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Validation failed", [
      { code: "invalid_body", message: "Request body must be a JSON object" },
    ]);
  }
}
