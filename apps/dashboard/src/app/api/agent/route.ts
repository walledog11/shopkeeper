import { NextResponse } from "next/server";
import { db } from "@clerk/db";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";
import { buildContext, runAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { AGENT_TURN_PREFIX } from "@/lib/agent/tools";
import type { OrgSettings } from "@/types";

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { threadId, instruction, approvedToolCalls } = await request.json();
    console.log("[agent] POST threadId:", threadId, "instruction:", instruction, "approvedToolCalls:", approvedToolCalls?.length ?? 0);

    if (!threadId || !instruction?.trim()) {
      return NextResponse.json(
        { error: "Missing threadId or instruction" },
        { status: 400 }
      );
    }

    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);
    const ctx = await buildContext(threadId, org.id);
    console.log("[agent] context — shopify:", ctx.shopify ? ctx.shopify.shop : "NONE", "shopifyCustomerId:", ctx.thread.shopifyCustomerId);

    const result = await runAgent(ctx, instruction.trim(), approvedToolCalls ?? undefined, settings);
    console.log("[agent] result:", JSON.stringify(result));

    // Persist the agent turn so it survives page refreshes
    await db.message.create({
      data: {
        threadId,
        senderType: "note",
        contentText: `${AGENT_TURN_PREFIX}${JSON.stringify({
          instruction: instruction.trim(),
          actions: result.actionsPerformed,
          summary: result.summary,
          error: null,
        })}`,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[agent] error:", error);
    return handleApiError(error, "Agent POST", "Failed to run agent");
  }
}
