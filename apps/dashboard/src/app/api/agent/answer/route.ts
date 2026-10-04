import { NextResponse } from "next/server";
import { db, createMessage } from "@shopkeeper/db";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { getLatestConversationMessage, requireOrgThread } from "@shopkeeper/agent/thread-auth";
import { buildAgentPlanCacheRecord, commitThreadPlanCacheIfCurrent } from "@shopkeeper/agent/plan-cache";
import { extractCachedQuestion, getPendingCustomerMessageId } from "@shopkeeper/agent/plan-cache-shape";
import { clearThreadPlanCache, supportAttemptSettlement } from "@shopkeeper/agent/plan-execution";
import {
  claimContinuedAgentTask, failAgentTaskClaim, settleAgentTaskClaim,
} from "@shopkeeper/agent/task-ledger";
import type { ContinuedTaskClaim } from "@shopkeeper/agent/task-ledger";
import { withAgentTaskClaim, type TaskRunControl } from "@shopkeeper/agent/task-run";
import { auth } from "@clerk/nextjs/server";
import { buildMerchantAnswerPlanningInstruction } from "@shopkeeper/agent/kb-learned";
import { saveMerchantAnswerToKb } from "@shopkeeper/agent/merchant-answer-kb";
import { decideAutonomy } from "@shopkeeper/agent/autonomy";
import { parseAgentAnswerBody } from "@/lib/agent/api/validation";
import { buildContext, hashInstructionForLog, planAgent } from "@/lib/agent/runner";
import { usesExactDraftProposals } from "@shopkeeper/agent/planner";
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
    where: {
      organizationId, threadId,
      OR: [
        { status: "waiting_input", cancelledAt: null },
        { runtimeVersion: { gte: 2 } },
      ],
    },
  });
  if (durableWait === 0) return null;
  const continuation = await claimContinuedAgentTask({
    organizationId, clerkUserId: userId, threadId, endsWait: "question",
    continuationInstruction: answer,
    continuationChannel: "operator",
    leaseMs: 300_000,
  });
  if (!continuation) {
    throw new ConflictError("This question is already being continued or is no longer available to answer.");
  }
  return continuation;
}

async function failAnsweredTask(continuation: ContinuedTaskClaim, orgId: string): Promise<void> {
  try {
    await failAgentTaskClaim({ ...continuation, failureCode: "answer_replan_failed" });
  } catch (err) {
    logger.error({ err, orgId, taskId: continuation.taskId }, "[agent:answer] could not record task failure");
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

    const replan = async (control?: TaskRunControl) => {
      let savedArticle: { title: string; body: string } | null = null;
      await createMessage({
        threadId,
        senderType: "note",
        contentText: question
          ? `Merchant answered the agent's question.\n\nQ: ${question}\nA: ${answer}`
          : `Merchant note for the agent: ${answer}`,
      });
      if (saveToKb) {
        const saved = await saveMerchantAnswerToKb({
          organizationId: org.id, threadId, question, answer,
          threadTag: threadMeta?.tag,
          channelType: thread.channelType,
          threadSummary: thread.aiSummary,
        });
        savedArticle = { title: saved.title, body: saved.body };
      }

      if (!pendingCustomerMessageId) {
        if (continuation && !(await settleAgentTaskClaim({ ...continuation, settlement: { status: "completed" } }))) {
          throw new ConflictError("Task claim was lost before the answer was recorded.");
        }
        if (thread.cachedPlan || thread.cachedPlanMessageId) {
          await clearThreadPlanCache({ orgId: org.id, threadId });
        }
        logger.info({ orgId: org.id, threadId, saveToKb, reason: "thread_already_answered" }, "[agent:answer] skipped re-plan");
        return NextResponse.json({ kind: "needs_review", question: null, replyText: null });
      }

      const baseInstruction = thread.requestSummary || "Handle this customer's latest request";
      const planningInstruction = buildMerchantAnswerPlanningInstruction({ baseInstruction, question, answer, saveToKb });
      const ctx = await buildContext(threadId, org.id, {
        ...(savedArticle ? { pinKbArticles: [savedArticle] } : {}),
        ...(continuation ? { runtimeVersion: continuation.runtimeVersion } : {}),
      });
      if (continuation && control) {
        ctx.taskBudget = control.taskBudget;
        ctx.assertExecutionAllowed = control.assertExecutionAllowed;
        ctx.agentRequestId = continuation.requestId;
        ctx.agentTaskId = continuation.taskId;
      }
      const drafted = await planAgent(ctx, planningInstruction, settings, {
        ...(usesExactDraftProposals(continuation?.runtimeVersion) ? { exactDraftProposal: true } : {}),
        ...(continuation ? { runtimeVersion: continuation.runtimeVersion } : {}),
      });
      const plan = { ...drafted, instruction: baseInstruction };
      const cacheRecord = buildAgentPlanCacheRecord({
        instruction: baseInstruction, lastCustomerMessageId: pendingCustomerMessageId, settings, plan,
      });
      const verdict = decideAutonomy(plan, settings);
      control?.assertExecutionAllowed();
      // The proposal and its cache become visible in the same transaction, only
      // while this task owns its lease and this customer message is current.
      const committed = continuation
        ? await settleAgentTaskClaim({
            ...continuation,
            settlement: await supportAttemptSettlement({
              orgId: org.id, threadId, settings, allowMutativeAutoExecute: false, manualReview: true,
              merchantQuestion: verdict.kind === "needs_merchant_input" ? verdict.question : null,
              sourceRequestIds: [continuation.requestId], proposedCache: cacheRecord,
            }),
            planCache: { threadId, sourceMessageId: pendingCustomerMessageId, cache: cacheRecord },
          })
        : await commitThreadPlanCacheIfCurrent({
            orgId: org.id, threadId, sourceMessageId: pendingCustomerMessageId, cache: cacheRecord,
          });
      if (!committed) throw new ConflictError("The task stopped or the customer message changed before the draft was published.");

      logger.info({
        orgId: org.id, threadId, durationMs: Date.now() - startedAt, saveToKb,
        kind: verdict.kind, instructionHash: hashInstructionForLog(planningInstruction),
      }, "[agent:answer] re-planned");
      return NextResponse.json({
        kind: verdict.kind,
        question: verdict.kind === "needs_merchant_input" ? verdict.question : null,
        replyText: verdict.kind === "quick_reply" || verdict.kind === "auto_execute" ? verdict.replyText : null,
      });
    };

    try {
      return continuation ? await withAgentTaskClaim(continuation, replan) : await replan();
    } catch (err) {
      if (continuation) await failAnsweredTask(continuation, org.id);
      throw err;
    }
  },
);
