import { NextResponse } from "next/server";
import { db } from "@clerk/db";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";
import { buildContext, runAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { AGENT_TURN_PREFIX } from "@/lib/agent/tools";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import type { OrgSettings } from "@/types";
import logger from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`agent:${org.id}`, 10, 60);
    if (!rl.success) return tooManyRequests(rl.reset);
    const { threadId, instruction, approvedToolCalls } = await request.json();
    logger.info({ threadId, instruction, approvedToolCalls: approvedToolCalls?.length ?? 0 }, '[agent] POST');

    if (!threadId || !instruction?.trim()) {
      return NextResponse.json(
        { error: "Missing threadId or instruction" },
        { status: 400 }
      );
    }

    if (instruction.length > 2000) {
      return NextResponse.json({ error: "Instruction too long" }, { status: 400 });
    }

    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);
    const ctx = await buildContext(threadId, org.id);
    logger.info({ shopify: ctx.shopify?.shop ?? null, shopifyCustomerId: ctx.thread.shopifyCustomerId }, '[agent] context');

    const result = await runAgent(ctx, instruction.trim(), approvedToolCalls ?? undefined, settings);
    logger.info({ result }, '[agent] result');

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
    logger.error({ err: error }, '[agent] error');
    return handleApiError(error, "Agent POST", "Failed to run agent");
  }
}
