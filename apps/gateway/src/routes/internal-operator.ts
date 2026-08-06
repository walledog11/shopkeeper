import express, { type Request, type Response, type Router } from 'express';
import { isSpendCapError, nanoDollarsToUsd } from '@shopkeeper/db';
import { ApiError } from '@shopkeeper/agent/errors';
import logger from '../logger.js';
import { runOperatorFreeFormTurn } from '../message-handlers/operator-free-form-turn.js';
import {
  expectedPlanIdentity,
  getContext,
  loadLivePendingPlans,
  normalizeApprovedToolCalls,
} from '../operator-context.js';
import { clearPendingPlan, runApprovedPendingPlan } from '../message-handlers/pending-plan-actions.js';
import { resolveOperatorMemberKey } from '../operator-identity.js';
import { pushOperatorEscalation } from '../operator-escalation.js';
import { internalJsonParser } from './body-parsers.js';
import { authorizeInternalRequest } from './internal-auth.js';
import type { OperatorMessageContext } from './operator-message.js';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function registerInternalOperatorRoutes(router: Router): void {
  router.post('/operator/escalate', internalJsonParser(), async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalOperator')) return;

    const body = req.body as { organizationId?: unknown; threadId?: unknown; reason?: unknown };
    const organizationId = typeof body.organizationId === 'string' ? body.organizationId : null;
    const threadId = typeof body.threadId === 'string' ? body.threadId : null;
    const reason = typeof body.reason === 'string' ? body.reason : '';
    if (!organizationId || !threadId) {
      return res.status(400).json({ error: 'organizationId and threadId are required' });
    }

    try {
      const notified = await pushOperatorEscalation(organizationId, threadId, reason);
      if (notified === null) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      return res.status(200).json({ notified });
    } catch (err) {
      logger.error(
        { err: (err as Error).message, organizationId, threadId },
        '[InternalOperator] escalation handler error',
      );
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // The operator turn for a transport that has no provider send of its own: the
  // dashboard Concierge. It posts the merchant's instruction and the HTTP
  // response *is* the reply, so there is no progress channel to fill and no
  // delivery ref to exclude from plan fan-out. The thread and the pending queue
  // are the merchant's own, resolved from their member identity — the same ones
  // their phone talks to.
  router.post('/operator/turn', internalJsonParser(), async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalOperator')) return;

    const body = req.body as Record<string, unknown>;
    const organizationId = stringField(body.organizationId);
    const clerkUserId = stringField(body.clerkUserId);
    const instruction = stringField(body.instruction);
    if (!organizationId || !clerkUserId || !instruction) {
      return res.status(400).json({
        error: 'organizationId, clerkUserId, and instruction are required',
      });
    }

    try {
      const memberKey = await resolveOperatorMemberKey(organizationId, clerkUserId);
      const message: OperatorMessageContext = {
        chatId: memberKey,
        body: instruction,
        senderRef: memberKey,
        reply: async () => {},
        presence: (_progress, work) => work(),
      };

      const context = await loadLivePendingPlans(
        organizationId,
        memberKey,
        await getContext(organizationId, memberKey),
      );
      const result = await runOperatorFreeFormTurn({
        organizationId,
        clerkUserId,
        message,
        context,
      });
      // Whether anything is still awaiting a decision after the turn — the panel
      // renders its Approve affordance off this rather than parsing the summary.
      const after = await getContext(organizationId, memberKey);
      return res.status(200).json({
        threadId: result.threadId,
        summary: result.summary,
        actionsPerformed: result.actionsPerformed,
        awaitingApproval: after.pendingPlans.length > 0,
      });
    } catch (err) {
      if (isSpendCapError(err)) {
        return res.status(429).json({
          error: 'AI spend cap reached for today. Increase the daily limit in Settings or wait until midnight UTC.',
          code: 'spend_cap_reached',
          currentUsd: nanoDollarsToUsd(err.currentNanoUsd),
          capUsd: nanoDollarsToUsd(err.capNanoUsd),
        });
      }
      if (err instanceof ApiError && err.status < 500) {
        return res.status(err.status).json({ error: err.message });
      }
      logger.error(
        { err: (err as Error).message, organizationId, clerkUserId },
        '[InternalOperator] turn handler error',
      );
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // A button press on a plan in the dashboard's pending ledger. The merchant has
  // already said which plan and what to do with it, so this runs the same
  // approve/dismiss the control tools run with no model call in between — the
  // dashboard's equivalent of the messaging channels' keyword fast path. Plans are
  // addressed by planId, so a plan resolved elsewhere in the meantime 409s rather
  // than acting on whatever is at that position now.
  router.post('/operator/plan-decision', internalJsonParser(), async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalOperator')) return;

    const body = req.body as Record<string, unknown>;
    const organizationId = stringField(body.organizationId);
    const clerkUserId = stringField(body.clerkUserId);
    const planId = stringField(body.planId);
    const decision = stringField(body.decision);
    if (!organizationId || !clerkUserId || !planId || (decision !== 'approve' && decision !== 'dismiss')) {
      return res.status(400).json({
        error: 'organizationId, clerkUserId, planId, and decision (approve|dismiss) are required',
      });
    }

    try {
      const memberKey = await resolveOperatorMemberKey(organizationId, clerkUserId);
      const context = await loadLivePendingPlans(
        organizationId,
        memberKey,
        await getContext(organizationId, memberKey),
      );
      const plan = context.pendingPlans.find((pending) => pending.planId === planId);
      if (!plan) {
        return res.status(409).json({ error: 'That plan is no longer waiting on you.' });
      }

      if (decision === 'dismiss') {
        await clearPendingPlan(organizationId, memberKey, plan);
        return res.status(200).json({ summary: 'Plan dismissed.' });
      }

      const identity = expectedPlanIdentity(plan);
      const summary = await runApprovedPendingPlan({
        organizationId,
        memberKey,
        clerkUserId,
        threadId: plan.threadId,
        instruction: plan.instruction,
        approvedToolCalls: normalizeApprovedToolCalls(plan.rawToolCalls),
        ...(identity ? { expectedIdentity: identity } : {}),
        pendingPlan: plan,
      });
      return res.status(200).json({ summary });
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) {
        return res.status(err.status).json({ error: err.message });
      }
      logger.error(
        { err: (err as Error).message, organizationId, clerkUserId, planId, decision },
        '[InternalOperator] plan-decision handler error',
      );
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });
}

const router = express.Router();
registerInternalOperatorRoutes(router);
export default router;
