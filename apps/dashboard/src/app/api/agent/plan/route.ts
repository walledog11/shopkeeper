import { NextResponse } from "next/server";
import { db } from "@clerk/db";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { requireOrgThread } from "@/lib/agent/api/auth";
import { buildAgentPlanCacheRecord, isAgentPlanCacheHit, readAgentPlanCache } from "@/lib/agent/api/plan-cache";
import { parseAgentPlanBody } from "@/lib/agent/api/validation";
import { buildContext, hashInstructionForLog, planAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@clerk/agent/settings";
import type { OrgSettings } from "@/types";
import logger from "@/lib/server/logger";

export const maxDuration = 60;

export const POST = withOrgRoute(
  {
    context: "Agent plan POST",
    errorMessage: "Failed to generate plan",
    requireBillingWriteAllowed: true,
    rateLimit: { key: "agent:plan", limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const startedAt = Date.now();
    const { threadId, instruction, force } = parseAgentPlanBody(await readRequiredJsonObject(request));
    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);
    const instructionHash = hashInstructionForLog(instruction);

    logger.info({
      orgId: org.id,
      threadId,
      force: Boolean(force),
      instructionLength: instruction.length,
      instructionHash,
    }, "[agent:plan] POST");

    const thread = await requireOrgThread(threadId, org.id);
    const lastCustomerMessage = thread.messages[0] ?? null;

    if (!lastCustomerMessage) {
      logger.info({
        orgId: org.id,
        threadId,
        durationMs: Date.now() - startedAt,
        reason: "no_last_customer_message",
        instructionHash,
      }, "[agent:plan] skipped");
      return NextResponse.json({ instruction, steps: [], rawToolCalls: [] });
    }

    const cachedPlan = readAgentPlanCache(thread.cachedPlan);
    if (!force && isAgentPlanCacheHit({
      cache: cachedPlan,
      instruction,
      lastCustomerMessageId: lastCustomerMessage.id,
      settings,
    })) {
      logger.info({
        orgId: org.id,
        threadId,
        durationMs: Date.now() - startedAt,
        rawToolCallCount: cachedPlan?.plan.rawToolCalls.length ?? 0,
        visibleStepCount: cachedPlan?.plan.steps.length ?? 0,
        instructionHash,
      }, "[agent:plan] cache hit");
      return NextResponse.json(cachedPlan?.plan);
    }

    // Cache miss , generate via LLM
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

    logger.info({
      orgId: org.id,
      threadId,
      durationMs: Date.now() - startedAt,
      rawToolCallCount: plan.rawToolCalls.length,
      visibleStepCount: plan.steps.length,
      warningCount: plan.warnings?.length ?? 0,
      instructionHash,
    }, "[agent:plan] response");

    return NextResponse.json(plan);
  },
);
