import { NextResponse } from "next/server";
import { db, createMessage } from "@shopkeeper/db";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { getLatestConversationMessage, requireOrgThread } from "@shopkeeper/agent/thread-auth";
import { buildAgentPlanCacheRecord } from "@shopkeeper/agent/plan-cache";
import { extractCachedQuestion, getPendingCustomerMessageId } from "@shopkeeper/agent/plan-cache-shape";
import { clearThreadPlanCache, supportAttemptSettlement } from "@shopkeeper/agent/plan-execution";
import {
  claimContinuedAgentTask, failAgentTaskClaim, settleAgentTaskClaim,
} from "@shopkeeper/agent/task-ledger";
import type { ContinuedTaskClaim, TaskSettlement } from "@shopkeeper/agent/task-ledger";
import { auth } from "@clerk/nextjs/server";
import { buildMerchantAnswerPlanningInstruction } from "@shopkeeper/agent/kb-learned";
import { saveMerchantAnswerToKb } from "@shopkeeper/agent/merchant-answer-kb";
import { decideAutonomy } from "@shopkeeper/agent/autonomy";
import { parseAgentAnswerBody } from "@/lib/agent/api/validation";
import { buildContext, hashInstructionForLog, planAgent } from "@/lib/agent/runner";
import { suspendsAtProposal } from "@shopkeeper/agent/planner";
import { ConflictError } from "@shopkeeper/shared/errors";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import type { OrgSettings } from "@/types";
import logger from "@/lib/server/logger";

export const maxDuration = 60;

/**
 * Ends the durable wait this answer was asked under, and claims the task for the
 * re-plan below. Null is allowed only when no durable wait exists (for a legacy
 * cached question); a durable wait that cannot be claimed fails closed.
 */
async function claimAnsweredTaskForThread(
  organizationId: string,
  threadId: string,
  answer: string,
): Promise<ContinuedTaskClaim | null> {
  const { userId } = await auth();
  if (!userId) throw new ConflictError("The answering member session is no longer available.");
  const durableWait = await db.agentTask.count({
    where: { organizationId, threadId, status: "waiting_input", cancelledAt: null },
  });
  if (durableWait === 0) return null;
  const continuation = await claimContinuedAgentTask({
    organizationId, clerkUserId: userId, threadId, endsWait: "question",
    continuationInstruction: answer,
    continuationChannel: "operator",
  });
  if (!continuation) {
    throw new ConflictError("This question is already being continued or is no longer available to answer.");
  }
  return continuation;
}

async function settleAnsweredTask(
  continuation: ContinuedTaskClaim,
  settlement: TaskSettlement | "failed",
  orgId: string,
): Promise<void> {
  try {
    if (settlement === "failed") {
      await failAgentTaskClaim({ ...continuation, failureCode: "answer_replan_failed" });
      return;
    }
    const settled = await settleAgentTaskClaim({ ...continuation, settlement });
    if (!settled) {
      logger.warn({ orgId, taskId: continuation.taskId }, "[agent:answer] task claim lost before settlement");
    }
  } catch (err) {
    // The answer is recorded and the re-drafted plan is cached. Losing the
    // settlement leaves the task claimed for the lease sweep to reconcile; it
    // must not turn a delivered re-plan into a failed request.
    logger.error({ err, orgId, taskId: continuation.taskId }, "[agent:answer] could not settle answered task");
  }
}

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
      getLatestConversationMessage(threadId, org.id),
      db.thread.findFirst({ where: { id: threadId, organizationId: org.id }, select: { tag: true } }),
    ]);
    const pendingCustomerMessageId = latestConversation
      ? getPendingCustomerMessageId([latestConversation])
      : null;
    const question = extractCachedQuestion(thread.cachedPlan);
    const continuation = await claimAnsweredTaskForThread(org.id, threadId, answer);

    let savedArticle: { title: string; body: string } | null = null;
    try {
      await createMessage({
        threadId,
        senderType: "note",
        contentText: question
          ? `Merchant answered the agent's question.\n\nQ: ${question}\nA: ${answer}`
          : `Merchant note for the agent: ${answer}`,
      });
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
    } catch (err) {
      if (continuation) await settleAnsweredTask(continuation, "failed", org.id);
      throw err;
    }

    // The customer message is gone (already handled elsewhere) — nothing to re-plan against.
    if (!pendingCustomerMessageId) {
      if (thread.cachedPlan || thread.cachedPlanMessageId) {
        await clearThreadPlanCache({ orgId: org.id, threadId });
      }
      // The wait is over and there is nothing for the merchant to come back to.
      if (continuation) await settleAnsweredTask(continuation, { status: "completed" }, org.id);
      logger.info({ orgId: org.id, threadId, saveToKb, reason: "thread_already_answered" }, "[agent:answer] skipped re-plan");
      return NextResponse.json({ kind: "needs_review", question: null, replyText: null });
    }

    // Current request, not the episode summary — same reason as the gateway's
    // replan path: the merchant answered a question about what is being asked
    // now.
    const baseInstruction = thread.requestSummary || "Handle this customer's latest request";
    const planningInstruction = buildMerchantAnswerPlanningInstruction({
      baseInstruction,
      question,
      answer,
      saveToKb,
    });

    let plan;
    try {
      const ctx = await buildContext(threadId, org.id, savedArticle
        ? { pinKbArticles: [savedArticle] }
        : undefined);
      plan = await planAgent(
        ctx,
        planningInstruction,
        settings,
        {
          ...(suspendsAtProposal(continuation?.runtimeVersion)
            ? { suspendAtProposal: true }
            : {}),
          ...(continuation?.runtimeVersion !== undefined
            ? { runtimeVersion: continuation.runtimeVersion }
            : {}),
        },
      );

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
    } catch (err) {
      if (continuation) await settleAnsweredTask(continuation, "failed", org.id);
      throw err;
    }

    const verdict = decideAutonomy(plan, settings);
    if (continuation) {
      await settleAnsweredTask(continuation, await supportAttemptSettlement({
        orgId: org.id,
        threadId,
        settings,
        // This route shows the merchant the re-drafted plan and executes
        // nothing, so whatever it drafted is theirs to approve.
        allowMutativeAutoExecute: false,
        // A re-drafted plan that asks again is still waiting on the merchant,
        // and recording that is what lets the next answer continue this task.
        merchantQuestion: verdict.kind === "needs_merchant_input" ? verdict.question : null,
        sourceRequestIds: [continuation.requestId],
      }), org.id);
    }

    logger.info({
      orgId: org.id,
      threadId,
      durationMs: Date.now() - startedAt,
      saveToKb,
      kind: verdict.kind,
      instructionHash: hashInstructionForLog(planningInstruction),
    }, "[agent:answer] re-planned");

    return NextResponse.json({
      kind: verdict.kind,
      question: verdict.kind === "needs_merchant_input" ? verdict.question : null,
      replyText: verdict.kind === "quick_reply" || verdict.kind === "auto_execute"
        ? verdict.replyText
        : null,
    });
  },
);
