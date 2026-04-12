import { NextResponse } from "next/server";

export const maxDuration = 60;
import { db } from "@clerk/db";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";
import { buildContext, planAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import type { AgentPlan, OrgSettings } from "@/types";

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`agent:plan:${org.id}`, 20, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { threadId, instruction, force } = await request.json();

    if (!threadId || !instruction?.trim()) {
      return NextResponse.json(
        { error: "Missing threadId or instruction" },
        { status: 400 }
      );
    }

    if (instruction.length > 2000) {
      return NextResponse.json({ error: "Instruction too long" }, { status: 400 });
    }

    // Single query: fetch thread cache fields + last customer message
    const thread = await db.thread.findUnique({
      where: { id: threadId },
      select: {
        cachedPlanMessageId: true,
        cachedPlan: true,
        messages: {
          where: { senderType: "customer" },
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    });

    const lastCustomerMessage = thread?.messages[0] ?? null;

    if (!lastCustomerMessage) {
      return NextResponse.json({ instruction, steps: [], rawToolCalls: [] });
    }

    const cachedPlan = thread?.cachedPlan as AgentPlan | null;
    if (!force && thread?.cachedPlanMessageId === lastCustomerMessage.id && cachedPlan?.steps?.length) {
      return NextResponse.json(cachedPlan);
    }

    // Cache miss — generate via LLM
    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);
    const ctx = await buildContext(threadId, org.id);
    const plan = await planAgent(ctx, instruction.trim(), settings);

    // Persist to DB so future calls (hard reload, other agents) skip the LLM
    await db.thread.update({
      where: { id: threadId },
      data: {
        cachedPlanMessageId: lastCustomerMessage.id,
        cachedPlan: plan as object,
      },
    });

    return NextResponse.json(plan);
  } catch (error) {
    return handleApiError(error, "Agent plan POST", "Failed to generate plan");
  }
}
