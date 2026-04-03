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
import { db, type Prisma } from "@clerk/db";
import { buildContext, planAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { handleApiError } from "@/lib/api-errors";
import type { OrgSettings } from "@/types";

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-internal-secret");
    if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId, threadId } = await request.json();

    if (!orgId || !threadId) {
      return NextResponse.json(
        { error: "Missing orgId or threadId" },
        { status: 400 }
      );
    }

    const thread = await db.thread.findUnique({
      where: { id: threadId },
      select: {
        organizationId: true,
        aiSummary: true,
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

    if (!thread || thread.organizationId !== orgId) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const instruction =
      thread.aiSummary || "Handle this customer's latest request";

    const lastCustomerMessage = thread.messages[0] ?? null;

    // Return cached plan if still valid
    if (
      lastCustomerMessage &&
      thread.cachedPlanMessageId === lastCustomerMessage.id &&
      thread.cachedPlan
    ) {
      return NextResponse.json({ plan: thread.cachedPlan, instruction });
    }

    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = resolveAgentSettings(
      org?.settings as Partial<OrgSettings> | null
    );
    const ctx = await buildContext(threadId, orgId);
    const plan = await planAgent(ctx, instruction, settings);

    if (lastCustomerMessage) {
      await db.thread.update({
        where: { id: threadId },
        data: {
          cachedPlanMessageId: lastCustomerMessage.id,
          cachedPlan: plan as Prisma.InputJsonValue,
        },
      });
    }

    return NextResponse.json({ plan, instruction });
  } catch (error) {
    return handleApiError(error, "Agent plan-internal POST", "Failed to generate plan");
  }
}
