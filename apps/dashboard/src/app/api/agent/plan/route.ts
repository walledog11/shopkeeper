import { NextResponse } from "next/server";

export const maxDuration = 60;
import { getOrCreateOrg } from "@/lib/server/org";
import { handleApiError } from "@/lib/api/errors";
import { requireOrgThread } from "@/lib/agent/api/auth";
import { buildAgentPlanCacheRecord, isAgentPlanCacheHit, readAgentPlanCache } from "@/lib/agent/api/plan-cache";
import { parseAgentPlanBody } from "@/lib/agent/api/validation";
import { buildContext, planAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { db } from "@clerk/db";
import type { OrgSettings } from "@/types";

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`agent:plan:${org.id}`, 20, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { threadId, instruction, force } = parseAgentPlanBody(await request.json());
    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);

    const thread = await requireOrgThread(threadId, org.id);
    const lastCustomerMessage = thread.messages[0] ?? null;

    if (!lastCustomerMessage) {
      return NextResponse.json({ instruction, steps: [], rawToolCalls: [] });
    }

    const cachedPlan = readAgentPlanCache(thread.cachedPlan);
    if (!force && isAgentPlanCacheHit({
      cache: cachedPlan,
      instruction,
      lastCustomerMessageId: lastCustomerMessage.id,
      settings,
    })) {
      return NextResponse.json(cachedPlan?.plan);
    }

    // Cache miss — generate via LLM
    const ctx = await buildContext(threadId, org.id);
    const plan = await planAgent(ctx, instruction, settings);

    // Persist to DB so future calls (hard reload, other agents) skip the LLM
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

    return NextResponse.json(plan);
  } catch (error) {
    return handleApiError(error, "Agent plan POST", "Failed to generate plan");
  }
}
