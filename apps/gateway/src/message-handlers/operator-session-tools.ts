import { defineTool, stringArg, toolError, toolOk, type AgentToolDefinition } from '@shopkeeper/agent/tools';
import type { SupportContext } from '@shopkeeper/agent/context';
import logger from '../logger.js';
import {
  expectedPlanIdentity,
  updateContext,
  normalizeApprovedToolCalls,
  type OperatorContext,
} from '../operator-context.js';
import { runApprovedPendingPlan, clearPendingPlan } from './pending-plan-actions.js';
import { applyOperatorAnswerReplan } from './operator-answer-replan.js';

export interface OperatorSessionToolDeps {
  organizationId: string;
  clerkUserId: string;
  chatId: string;
  senderRef: string;
  // Snapshot of the operator context at the start of the turn. Supplies the
  // pending plan / question the control tools act on; the model interprets the
  // merchant's intent and fires the matching tool.
  context: OperatorContext;
}

interface ReviseGuidanceInput {
  guidance: string;
}

interface AnswerQuestionInput {
  answer: string;
}

const NO_PENDING_PLAN = 'Error: no plan is awaiting the merchant\'s approval.';

// Deterministic state-transition tools for the operator agent turn. The model
// interprets the merchant's reply and calls one of these; the tool effects the
// transition without authoring the action — approval fires the exact stored
// tool calls the merchant was shown, verbatim. Built per turn so they close over
// the live message/context. Passed to runAgent as moduleTools: category "action"
// with categoryPermission off (no workspace tool toggle can hide an approval),
// empty capabilities (they need only org identity, present on every context).
// The surrounding operator turn owns presence, so these tools never nest their
// own "working on it" feedback.
export function buildOperatorSessionTools(
  deps: OperatorSessionToolDeps,
): Record<string, AgentToolDefinition> {
  const { organizationId, clerkUserId, chatId, senderRef, context } = deps;

  const approvePendingPlan = defineTool({
    name: 'approve_pending_plan',
    description:
      'Approve and execute the plan the merchant is being shown. Call this when the merchant clearly agrees to send it as drafted (yes / send it / go ahead / looks good). It runs exactly the drafted actions — you cannot change them.',
    fields: {},
    category: 'action',
    group: 'thread',
    capabilities: [],
    label: 'Approved pending plan',
    planStepLabel: 'Approve pending plan',
    policy: { categoryPermission: false },
    execute: async (_input, ctx) => {
      const pendingPlan = context.pendingPlan;
      if (!pendingPlan) return toolError(NO_PENDING_PLAN);

      // The operator turn holds the operator thread's lock; approval runs on the
      // ticket thread's lock — different thread ids, no deadlock. Guard the
      // impossible same-thread case rather than deadlock on it.
      const currentThreadId = (ctx as Partial<SupportContext>).thread?.id;
      if (currentThreadId && pendingPlan.threadId === currentThreadId) {
        return toolError('Error: the pending plan targets the current thread and cannot be approved from here.');
      }

      let summary: string;
      try {
        summary = await runApprovedPendingPlan({
          organizationId,
          chatId,
          clerkUserId,
          threadId: pendingPlan.threadId,
          instruction: pendingPlan.instruction,
          approvedToolCalls: normalizeApprovedToolCalls(pendingPlan.rawToolCalls),
          ...(expectedPlanIdentity(pendingPlan) ? { expectedIdentity: expectedPlanIdentity(pendingPlan) } : {}),
          pendingPlan,
        });
      } catch (err) {
        logger.error({ err, organizationId, threadId: pendingPlan.threadId }, '[Operator] approve_pending_plan failed');
        return toolError('Error: something went wrong running the plan. Please try again.');
      }

      return toolOk(summary);
    },
  });

  const rejectPendingPlan = defineTool({
    name: 'reject_pending_plan',
    description:
      'Dismiss the plan the merchant is being shown. Call this when the merchant clearly declines it (no / don\'t / cancel / skip it).',
    fields: {},
    category: 'action',
    group: 'thread',
    capabilities: [],
    label: 'Dismissed pending plan',
    planStepLabel: 'Dismiss pending plan',
    policy: { categoryPermission: false },
    execute: async () => {
      if (!context.pendingPlan) return toolError(NO_PENDING_PLAN);
      await clearPendingPlan(organizationId, chatId, context.pendingPlan);
      return toolOk('Plan dismissed.');
    },
  });

  const revisePendingPlan = defineTool({
    name: 'revise_pending_plan',
    description:
      'Re-draft the plan the merchant is being shown, folding in their guidance. Call this when the merchant supplies a fact, correction, or change for the drafted plan instead of approving or declining it.',
    fields: {
      guidance: stringArg(
        'The merchant\'s guidance to fold into the new draft — their fact, correction, or requested change, in their words.',
        { required: true },
      ),
    },
    category: 'action',
    group: 'thread',
    capabilities: [],
    label: 'Revised pending plan',
    planStepLabel: 'Revise pending plan',
    policy: { categoryPermission: false },
    execute: async (input: ReviseGuidanceInput) => {
      const pendingPlan = context.pendingPlan;
      if (!pendingPlan) return toolError(NO_PENDING_PLAN);
      const message = await applyOperatorAnswerReplan({
        organizationId,
        chatId,
        threadId: pendingPlan.threadId,
        answer: input.guidance,
        senderRef,
      });
      return toolOk(message);
    },
  });

  const answerOperatorQuestion = defineTool({
    name: 'answer_operator_question',
    description:
      'Record the merchant\'s answer to the question the agent asked, then re-draft the reply. Call this when a question is pending and the merchant\'s message answers it.',
    fields: {
      answer: stringArg('The merchant\'s answer to the pending question, in their words.', { required: true }),
    },
    category: 'action',
    group: 'thread',
    capabilities: [],
    label: 'Recorded merchant answer',
    planStepLabel: 'Record merchant answer',
    policy: { categoryPermission: false },
    execute: async (input: AnswerQuestionInput) => {
      const pendingQuestion = context.pendingQuestion;
      if (!pendingQuestion) return toolError('Error: no question is awaiting the merchant\'s answer.');
      await updateContext(organizationId, chatId, { pendingQuestion: null });
      const message = await applyOperatorAnswerReplan({
        organizationId,
        chatId,
        threadId: pendingQuestion.threadId,
        answer: input.answer,
        senderRef,
      });
      return toolOk(message);
    },
  });

  return {
    approve_pending_plan: approvePendingPlan,
    reject_pending_plan: rejectPendingPlan,
    revise_pending_plan: revisePendingPlan,
    answer_operator_question: answerOperatorQuestion,
  };
}
