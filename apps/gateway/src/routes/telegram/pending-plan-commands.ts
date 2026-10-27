import { db, SenderType } from '@shopkeeper/db';
import { resolveOperatorThread } from '@shopkeeper/agent/internal-thread';
import logger from '../../logger.js';
import {
  extractOrderNumber,
  expectedPlanIdentity,
  isPendingPlanInvalid,
  mostRecentPendingPlan,
  normalizeApprovedToolCalls,
  pendingPlanNeedsThreadReview,
  pendingPlanOrdinals,
  summarizePendingPlan,
  type OperatorContext,
} from '../../operator-context.js';
import { runApprovedPendingPlan, clearPendingPlan } from '../../message-handlers/operator/pending-plan-actions.js';
import { ConflictError } from '@shopkeeper/shared/errors';
import type { PendingPlanCommand } from './command-parser.js';
import type { OperatorMessageContext } from '../operator-message.js';

// A bare yes/no answers whatever the merchant read last. Cards, questions and
// digests are pushed and mirrored onto the operator thread without a task; the
// agent's own chat reply is written by its turn and carries that turn's task. When
// the agent spoke last, only the agent knows what "yes" agrees to.
async function agentTurnSpokeLast(organizationId: string, memberKey: string): Promise<boolean> {
  const thread = await resolveOperatorThread(organizationId, memberKey);
  const latest = await db.message.findFirst({
    where: { organizationId, threadId: thread.id, senderType: SenderType.agent, deletedAt: null },
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
    select: { agentTaskId: true },
  });
  return latest?.agentTaskId != null;
}

export async function handlePendingPlanCommand(
  organizationId: string,
  clerkUserId: string,
  message: OperatorMessageContext,
  command: PendingPlanCommand,
  context: OperatorContext,
): Promise<boolean> {
  const { chatId, senderRef: memberKey, reply, presence } = message;
  if (await agentTurnSpokeLast(organizationId, memberKey)) {
    logger.info({ chatId, command: command.type }, '[Operator] Decision answers the agent turn — handing to the model');
    return false;
  }
  const pendingPlan = mostRecentPendingPlan(context.pendingPlans);
  if (!pendingPlan) {
    // A bare yes/no is a decision about a specific draft. With none queued
    // there is nothing to decide, and falling through to the model turned the
    // word "Yes" into a fresh instruction it satisfied by attempting the refund
    // itself (2026-09-10). Answer it here instead — unless a question is
    // pending, which a bare "yes" can legitimately be answering.
    if (context.pendingQuestion) return false;
    logger.info({ chatId, command: command.type }, '[Operator] Decision with nothing queued');
    await reply(
      "Nothing is waiting for your approval right now — that draft is gone, so I haven't done anything. If you still want it, open the conversation and I'll write it up again.",
    );
    return true;
  }
  // A bare yes/no names no card. With one waiting it can only mean that one;
  // with several it could mean any, and the newest may have arrived after the
  // merchant started typing about another. Run nothing and ask which, numbering
  // each plan as the agent that reads the answer will resolve the number.
  if (context.pendingPlans.length > 1) {
    logger.info({ chatId, command: command.type, waiting: context.pendingPlans.length }, '[Operator] Bare decision with several plans waiting');
    const ordinals = pendingPlanOrdinals(context.pendingPlans, context.pendingDigest);
    const lines = context.pendingPlans
      .map((plan, index) => ({ ordinal: ordinals[index] ?? null, summary: summarizePendingPlan(plan) }))
      .sort((a, b) => (a.ordinal ?? Number.MAX_SAFE_INTEGER) - (b.ordinal ?? Number.MAX_SAFE_INTEGER))
      .map(({ ordinal, summary }) => (ordinal ? `${ordinal}. ${summary}` : summary));
    await reply([
      `You have ${context.pendingPlans.length} plans waiting, so I haven't done anything yet. Which one did you mean?`,
      ...lines,
      'Tell me which, by number or name.',
    ].join('\n'));
    return true;
  }
  if (pendingPlanNeedsThreadReview(pendingPlan, context.pendingDigest)) {
    await reply('The request details were unavailable in the briefing. Open the thread before deciding what to do with this plan.');
    return true;
  }
  const { threadId, instruction, rawToolCalls } = pendingPlan;
  if (command.type === 'plan-dismiss') {
    try {
      const dismissed = await clearPendingPlan(organizationId, memberKey, clerkUserId, pendingPlan);
      if (!dismissed) {
        await reply('That plan was already replaced or resolved.');
        return true;
      }
    } catch (error) {
      if (error instanceof ConflictError) {
        await reply("That plan is already running or completed, so it can't be dismissed.");
        return true;
      }
      throw error;
    }
    // Older parked plans carry no actionLabel.
    const dismissed = pendingPlan.actionLabel ? `Dismissed — I won't ${pendingPlan.actionLabel}.` : 'Plan dismissed.';
    await reply(dismissed);
    return true;
  }

  if (isPendingPlanInvalid(pendingPlan)) {
    await reply("This draft failed validation, so I can't run or partially run it. Tell me what to change, or reply no to dismiss it.");
    return true;
  }

  // The approval binds the whole bundle, so a subset can never execute; and
  // "skip 0" or an index past the last step fell through to running every step,
  // refund included. Leaving a step out is a revision.
  if (command.type === 'plan-skip') {
    await reply("I can't run part of a plan, so I've run nothing. Tell me what to change and I'll redraft it, or reply no to dismiss it.");
    return true;
  }

  const approvedRawToolCalls = normalizeApprovedToolCalls(rawToolCalls);

  logger.info({ chatId, threadId, toolCallCount: approvedRawToolCalls.length }, '[Operator] Approving plan');

  let execution: Awaited<ReturnType<typeof runApprovedPendingPlan>>;
  try {
    execution = await presence(
      {
        kind: 'plan-run',
        orderNumber: extractOrderNumber(instruction),
        instruction,
      },
      () => runApprovedPendingPlan({
        organizationId,
        memberKey,
        clerkUserId,
        threadId,
        instruction,
        approvedToolCalls: approvedRawToolCalls,
        ...(expectedPlanIdentity(pendingPlan) ? { expectedIdentity: expectedPlanIdentity(pendingPlan) } : {}),
        pendingPlan,
      }),
    );
  } catch (err) {
    logger.error({ err }, '[Operator] Operator agent turn failed (plan approval)');
    await reply('Something went wrong running the plan. Please try again.');
    return true;
  }

  await reply(execution.summary);
  return true;
}
