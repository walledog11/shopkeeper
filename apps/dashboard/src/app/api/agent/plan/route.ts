import { NextResponse } from "next/server";
import { db, type Prisma } from "@clerk/db";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";
import { buildContext, planAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import type { OrgSettings } from "@/types";

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { threadId, instruction } = await request.json();

    if (!threadId || !instruction?.trim()) {
      return NextResponse.json(
        { error: "Missing threadId or instruction" },
        { status: 400 }
      );
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

    if (thread?.cachedPlanMessageId === lastCustomerMessage.id && thread.cachedPlan) {
      return NextResponse.json(thread.cachedPlan);
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
        cachedPlan: plan as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(plan);
  } catch (error) {
    return handleApiError(error, "Agent plan POST", "Failed to generate plan");
  }
}
