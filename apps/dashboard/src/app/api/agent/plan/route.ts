import { NextResponse } from "next/server";
import { ConflictError } from "@/lib/api/errors";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { getLatestConversationMessage, requireOrgThread } from "@shopkeeper/agent/thread-auth";
import {
  buildAgentPlanCacheRecord,
  commitThreadPlanCacheIfCurrent,
  isAgentPlanCacheHit,
  readAgentPlanCache,
} from "@shopkeeper/agent/plan-cache";
import { getPendingCustomerMessageId } from "@shopkeeper/agent/plan-cache-shape";
import { clearThreadPlanCache } from "@shopkeeper/agent/plan-execution";
import { parseAgentPlanBody } from "@/lib/agent/api/validation";
import { buildContext, hashInstructionForLog, planAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import {
  captureAgentPlanDecided,
  captureAgentPlanGenerated,
} from "@/lib/server/product-analytics";
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

    const [thread, latestConversation] = await Promise.all([
      requireOrgThread(threadId, org.id),
      getLatestConversationMessage(threadId),
    ]);
    const pendingCustomerMessageId = latestConversation
      ? getPendingCustomerMessageId([latestConversation])
      : null;

    if (!pendingCustomerMessageId) {
      if (thread.cachedPlan || thread.cachedPlanMessageId) {
        await clearThreadPlanCache({ orgId: org.id, threadId });
      }
      logger.info({
        orgId: org.id,
        threadId,
        durationMs: Date.now() - startedAt,
        reason: "thread_already_answered",
        instructionHash,
      }, "[agent:plan] skipped");
      return NextResponse.json({ instruction, steps: [], rawToolCalls: [] });
    }

    const cachedPlan = readAgentPlanCache(thread.cachedPlan);
    if (force && cachedPlan?.planId) {
      void captureAgentPlanDecided({
        changed: false,
        channel: thread.channelType,
        decision: 'regenerated',
        organizationId: org.id,
        planId: cachedPlan.planId,
      });
    }
    if (!force && isAgentPlanCacheHit({
      cache: cachedPlan,
      instruction,
      lastCustomerMessageId: pendingCustomerMessageId,
      settings,
    })) {
      if (cachedPlan?.planId) {
        void captureAgentPlanGenerated({
          cacheHit: true,
          channel: thread.channelType,
          generationMs: Date.now() - startedAt,
          organizationId: org.id,
          planId: cachedPlan.planId,
          stepCount: cachedPlan.plan.steps.length,
        });
      }
      logger.info({
        orgId: org.id,
        threadId,
        durationMs: Date.now() - startedAt,
        rawToolCallCount: cachedPlan?.plan.rawToolCalls.length ?? 0,
        visibleStepCount: cachedPlan?.plan.steps.length ?? 0,
        instructionHash,
      }, "[agent:plan] cache hit");
      return NextResponse.json(cachedPlan?.planId
        ? { ...cachedPlan.plan, planId: cachedPlan.planId }
        : cachedPlan?.plan);
    }

    // Cache miss — generate via LLM
    const ctx = await buildContext(threadId, org.id);
    const plan = await planAgent(ctx, instruction, settings);
    const cacheRecord = buildAgentPlanCacheRecord({
      instruction,
      lastCustomerMessageId: pendingCustomerMessageId,
      settings,
      plan,
    });

    // Persist to DB so future calls (hard reload, other agents) skip the LLM
    const committed = await commitThreadPlanCacheIfCurrent({
      orgId: org.id,
      threadId,
      sourceMessageId: pendingCustomerMessageId,
      cache: cacheRecord,
    });
    if (!committed) {
      throw new ConflictError("A newer customer message arrived while this plan was being generated. Regenerate the plan.");
    }

    if (cacheRecord.planId && plan.steps.length > 0) {
      void captureAgentPlanGenerated({
        cacheHit: false,
        channel: thread.channelType,
        generationMs: Date.now() - startedAt,
        organizationId: org.id,
        planId: cacheRecord.planId,
        stepCount: plan.steps.length,
      });
    }

    logger.info({
      orgId: org.id,
      threadId,
      durationMs: Date.now() - startedAt,
      rawToolCallCount: plan.rawToolCalls.length,
      visibleStepCount: plan.steps.length,
      warningCount: plan.warnings?.length ?? 0,
      instructionHash,
    }, "[agent:plan] response");

    return NextResponse.json(cacheRecord.planId
      ? { ...plan, planId: cacheRecord.planId }
      : plan);
  },
);
