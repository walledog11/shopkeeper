import { NextResponse } from "next/server";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";
import { buildContext, runAgent } from "@/lib/agent/runner";

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { threadId, instruction } = await request.json();
    console.log("[agent] POST threadId:", threadId, "instruction:", instruction);

    if (!threadId || !instruction?.trim()) {
      return NextResponse.json(
        { error: "Missing threadId or instruction" },
        { status: 400 }
      );
    }

    const ctx = await buildContext(threadId, org.id);
    console.log("[agent] context — shopify:", ctx.shopify ? ctx.shopify.shop : "NONE", "shopifyCustomerId:", ctx.thread.shopifyCustomerId);

    const result = await runAgent(ctx, instruction.trim());
    console.log("[agent] result:", JSON.stringify(result));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[agent] error:", error);
    return handleApiError(error, "Agent POST", "Failed to run agent");
  }
}
