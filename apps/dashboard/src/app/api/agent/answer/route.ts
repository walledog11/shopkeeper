import { NextResponse } from "next/server";
import { db, createMessage } from "@shopkeeper/db";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { getLatestConversationMessage, requireOrgThread } from "@shopkeeper/agent/thread-auth";
import { buildAgentPlanCacheRecord } from "@shopkeeper/agent/plan-cache";
import { extractCachedQuestion, getPendingCustomerMessageId } from "@shopkeeper/agent/plan-cache-shape";
import { clearThreadPlanCache } from "@shopkeeper/agent/plan-execution";
import { buildMerchantAnswerPlanningInstruction } from "@shopkeeper/agent/kb-learned";
import { saveMerchantAnswerToKb } from "@shopkeeper/agent/merchant-answer-kb";
import { classifyHomePlan } from "@shopkeeper/agent/plan-preview";
import { parseAgentAnswerBody } from "@/lib/agent/api/validation";
import { buildContext, hashInstructionForLog, planAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import type { OrgSettings } from "@/types";
import logger from "@/lib/server/logger";

export const maxDuration = 60;

// The merchant has answered an `ask_operator` question. Record the answer, optionally
// persist it to the knowledge base, then re-plan the ticket so a normal reply rides the
// usual approval flow. A saved answer re-enters planning through the KB door
// (ctx.kbArticles); an unsaved one rides as a transient planning note for this re-plan
// only, so a one-off judgment call never becomes policy.
export const POST = withOrgRoute(
  {
    context: "Agent answer POST",
    errorMessage: "Failed to record answer",
    requireBillingWriteAllowed: true,
    rateLimit: { key: "agent:answer", limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const startedAt = Date.now();
    const { threadId, answer, saveToKb } = parseAgentAnswerBody(await readRequiredJsonObject(request));
    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);

    const [thread, latestConversation, threadMeta] = await Promise.all([
      requireOrgThread(threadId, org.id),
      getLatestConversationMessage(threadId),
      db.thread.findUnique({ where: { id: threadId }, select: { tag: true } }),
    ]);
    const pendingCustomerMessageId = latestConversation
      ? getPendingCustomerMessageId([latestConversation])
      : null;
    const question = extractCachedQuestion(thread.cachedPlan);

    await createMessage({
      threadId,
      senderType: "note",
      contentText: question
        ? `Merchant answered the agent's question.\n\nQ: ${question}\nA: ${answer}`
        : `Merchant note for the agent: ${answer}`,
    });

    let savedArticle: { title: string; body: string } | null = null;
    if (saveToKb) {
      const saved = await saveMerchantAnswerToKb({
        organizationId: org.id,
        threadId,
        question,
        answer,
        threadTag: threadMeta?.tag,
        channelType: thread.channelType,
        threadSummary: thread.aiSummary,
      });
      savedArticle = { title: saved.title, body: saved.body };
    }

    // The customer message is gone (already handled elsewhere) — nothing to re-plan against.
    if (!pendingCustomerMessageId) {
      if (thread.cachedPlan || thread.cachedPlanMessageId) {
        await clearThreadPlanCache({ orgId: org.id, threadId });
      }
      logger.info({ orgId: org.id, threadId, saveToKb, reason: "thread_already_answered" }, "[agent:answer] skipped re-plan");
      return NextResponse.json({ kind: "needs_review", question: null, replyText: null });
    }

    const baseInstruction = thread.aiSummary || "Handle this customer's latest request";
    const planningInstruction = buildMerchantAnswerPlanningInstruction({
      baseInstruction,
      question,
      answer,
      saveToKb,
    });

    const ctx = await buildContext(threadId, org.id, savedArticle
      ? { pinKbArticles: [savedArticle] }
      : undefined);
    const plan = await planAgent(ctx, planningInstruction, settings);

    // Cache under the base instruction so the normal /plan path serves this
    // answer-informed plan on a cache hit rather than re-asking.
    await db.thread.update({
      where: { id: threadId },
      data: {
        cachedPlanMessageId: pendingCustomerMessageId,
        cachedPlan: buildAgentPlanCacheRecord({
          instruction: baseInstruction,
          lastCustomerMessageId: pendingCustomerMessageId,
          settings,
          plan,
        }) as object,
      },
    });

    const classification = classifyHomePlan(plan, settings);

    logger.info({
      orgId: org.id,
      threadId,
      durationMs: Date.now() - startedAt,
      saveToKb,
      kind: classification.kind,
      instructionHash: hashInstructionForLog(planningInstruction),
    }, "[agent:answer] re-planned");

    return NextResponse.json({
      kind: classification.kind,
      question: classification.question,
      replyText: classification.replyText,
    });
  },
);
