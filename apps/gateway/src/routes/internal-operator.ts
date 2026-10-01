import express, { type Request, type Response, type Router } from 'express';
import { ApiError } from '@shopkeeper/shared/errors';
import {
  acceptMemberAgentRequest,
  acceptTicketAgentRequest,
  cancelMemberAgentTask,
  getMemberAgentRequest,
  listMemberAgentRequests,
} from '@shopkeeper/agent/task-ledger';
import { resolveOperatorThread } from '@shopkeeper/agent/internal-thread';
import logger from '../logger.js';
import {
  expectedPlanIdentity,
  isPendingPlanInvalid,
  getContext,
  loadLiveOperatorContext,
  normalizeApprovedToolCalls,
} from '../operator-context.js';
import { clearPendingPlan, runApprovedPendingPlan } from '../message-handlers/operator/pending-plan-actions.js';
import { resolveOperatorMemberKey } from '../operator-identity.js';
import { pushOperatorEscalation } from '../operator-escalation.js';
import { internalJsonParser } from './body-parsers.js';
import { authorizeInternalRequest } from './internal-auth.js';
import { ensureAgentTaskEnqueued, memberAgentTaskBudget } from '../agent-task-ingest.js';
import { readAgentPlanCache } from '@shopkeeper/agent/plan-cache';
import { removePendingPlanForThread } from '../operator-context.js';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

type MemberRequestRecord = NonNullable<Awaited<ReturnType<typeof getMemberAgentRequest>>>;

function durableRequestPayload(request: MemberRequestRecord) {
  const task = request.task;
  const response = task?.messages[0];
  const composer = request.channel !== 'operator';
  const checkpoint = task?.checkpoint;
  const current = !composer || (checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint) && checkpoint.planRequestId === request.id);
  const cache = composer && current ? readAgentPlanCache(request.thread?.cachedPlan) : null;
  const plan = cache && (task?.status === 'completed' || task?.status === 'waiting_input' || (task?.status === 'waiting_approval' && task.activeProposalId === cache.planId))
    ? { ...cache.plan, planId: cache.planId, instruction: cache.instruction } : null;
  return {
    threadId: request.threadId,
    requestId: request.id,
    instruction: request.normalizedInstruction,
    taskId: task?.id ?? null,
    status: current ? task?.status ?? request.state : 'cancelled',
    taskRevision: task?.revision ?? null,
    acceptedAt: request.acceptedAt,
    updatedAt: task?.updatedAt ?? request.attachedAt ?? request.acceptedAt,
    response: response ? {
      summary: response.contentText ?? '',
      actionsPerformed: (task?.actions ?? []).map((action) => ({
        tool: action.tool,
        result: action.output ?? '',
        input: action.input,
        status: action.status,
        category: action.category,
        ...(action.durationMs == null ? {} : { durationMs: action.durationMs }),
        ...(action.errorDetail ? { errorDetail: action.errorDetail } : {}),
      })),
      awaitingApproval: task?.status === 'waiting_approval',
    } : null,
    delivery: response ? { status: 'available', messageId: response.id } : { status: 'pending', messageId: null },
    failureCode: current ? task?.failureCode ?? null : 'superseded_request',
    cancelledAt: task?.cancelledAt ?? null,
    pendingQuestion: task?.pendingQuestion ?? null,
    ...(composer ? { plan } : {}),
  };
}

export function registerInternalOperatorRoutes(router: Router): void {
  router.post('/operator/plan-requests', internalJsonParser(), async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalOperator')) return;
    const body = req.body as Record<string, unknown>;
    const organizationId = stringField(body.organizationId);
    const clerkUserId = stringField(body.clerkUserId);
    const threadId = stringField(body.threadId);
    const clientRequestId = stringField(body.clientRequestId);
    const instruction = stringField(body.instruction);
    if (!organizationId || !clerkUserId || !threadId || !clientRequestId || !instruction || typeof body.force !== 'boolean') {
      return res.status(400).json({ error: 'organizationId, clerkUserId, threadId, clientRequestId, instruction, and force are required' });
    }
    try {
      const accepted = await acceptTicketAgentRequest({
        organizationId, clerkUserId, threadId, dedupeKey: clientRequestId, instruction,
        force: body.force, budget: memberAgentTaskBudget(organizationId),
      });
      if (!accepted.deduplicated) await removePendingPlanForThread(organizationId, threadId);
      try {
        if (accepted.task.status === 'queued') await ensureAgentTaskEnqueued(accepted.task);
      } catch (error) {
        logger.error({ err: error, taskId: accepted.task.id }, '[InternalOperator] Composer enqueue failed; sweep will recover');
      }
      const request = await getMemberAgentRequest({ organizationId, clerkUserId, requestId: accepted.request.id });
      if (!request) throw new Error('Accepted composer request could not be read.');
      return res.status(202).json({
        ...durableRequestPayload(request), statusUrl: `/api/agent/requests/${request.id}`, deduplicated: accepted.deduplicated,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) return res.status(error.status).json({ error: error.message });
      logger.error({ err: error, organizationId, threadId }, '[InternalOperator] Composer submission failed');
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  router.post('/operator/requests', internalJsonParser(), async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalOperator')) return;
    const body = req.body as Record<string, unknown>;
    const organizationId = stringField(body.organizationId);
    const clerkUserId = stringField(body.clerkUserId);
    const clientRequestId = stringField(body.clientRequestId);
    const instruction = stringField(body.instruction);
    if (!organizationId || !clerkUserId || !clientRequestId || !instruction) {
      return res.status(400).json({
        error: 'organizationId, clerkUserId, clientRequestId, and instruction are required',
      });
    }
    try {
      const memberKey = await resolveOperatorMemberKey(organizationId, clerkUserId);
      const thread = await resolveOperatorThread(organizationId, memberKey);
      const accepted = await acceptMemberAgentRequest({
        organizationId,
        clerkUserId,
        threadId: thread.id,
        dedupeKey: clientRequestId,
        instruction,
        budget: memberAgentTaskBudget(organizationId),
      });
      if (!accepted.task) throw new Error('Accepted dashboard request has no task.');
      try {
        if (accepted.task.status === 'queued') await ensureAgentTaskEnqueued(accepted.task);
      } catch (error) {
        // The persisted queued task is authoritative. The recovery sweep heals
        // the commit-to-enqueue gap, so a Redis outage does not invite a new ID.
        logger.error({ err: error, taskId: accepted.task.id }, '[InternalOperator] Task enqueue failed');
      }
      return res.status(202).json({
        ...durableRequestPayload({ ...accepted.request, thread: { cachedPlan: null }, task: { ...accepted.task, activeProposal: null, messages: [], actions: [] } }),
        statusUrl: `/api/agent/requests/${accepted.request.id}`,
        deduplicated: accepted.deduplicated,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) {
        return res.status(err.status).json({ error: err.message });
      }
      logger.error({ err, organizationId, clerkUserId }, '[InternalOperator] request submission failed');
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/operator/requests', async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalOperator')) return;
    const organizationId = stringField(req.query.organizationId);
    const clerkUserId = stringField(req.query.clerkUserId);
    if (!organizationId || !clerkUserId) {
      return res.status(400).json({ error: 'organizationId and clerkUserId are required' });
    }
    try {
      const threadId = stringField(req.query.threadId);
      const requests = await listMemberAgentRequests({ organizationId, clerkUserId, ...(threadId ? { threadId } : {}) });
      return res.status(200).json({ requests: requests.map((request) => durableRequestPayload(request as MemberRequestRecord)) });
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) return res.status(err.status).json({ error: err.message });
      logger.error({ err, organizationId, clerkUserId }, '[InternalOperator] request lookup failed');
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/operator/requests/:requestId', async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalOperator')) return;
    const organizationId = stringField(req.query.organizationId);
    const clerkUserId = stringField(req.query.clerkUserId);
    const requestId = stringField(req.params.requestId);
    if (!organizationId || !clerkUserId || !requestId) {
      return res.status(400).json({ error: 'organizationId, clerkUserId, and requestId are required' });
    }
    try {
      const request = await getMemberAgentRequest({ organizationId, clerkUserId, requestId });
      if (!request) return res.status(404).json({ error: 'Request not found' });
      return res.status(200).json(durableRequestPayload(request));
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) return res.status(err.status).json({ error: err.message });
      logger.error({ err, organizationId, clerkUserId, requestId }, '[InternalOperator] request status failed');
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Stop requested by the merchant. The decision is persisted at the task row;
  // an attempt already running keeps its claim until it observes the stop, and
  // anything already dispatched still reconciles rather than reporting reversal.
  router.post('/operator/requests/:requestId/cancel', internalJsonParser(), async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalOperator')) return;
    const body = req.body as Record<string, unknown>;
    const organizationId = stringField(body.organizationId);
    const clerkUserId = stringField(body.clerkUserId);
    const requestId = stringField(req.params.requestId);
    const taskRevision = typeof body.taskRevision === 'number' ? body.taskRevision : null;
    if (!organizationId || !clerkUserId || !requestId || taskRevision === null) {
      return res.status(400).json({
        error: 'organizationId, clerkUserId, requestId, and taskRevision are required',
      });
    }
    try {
      const request = await getMemberAgentRequest({ organizationId, clerkUserId, requestId });
      if (!request?.task) return res.status(404).json({ error: 'Request not found' });
      await cancelMemberAgentTask({
        organizationId,
        clerkUserId,
        taskId: request.task.id,
        expectedRevision: taskRevision,
      });
      const updated = await getMemberAgentRequest({ organizationId, clerkUserId, requestId });
      return res.status(200).json(durableRequestPayload((updated ?? request) as MemberRequestRecord));
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) return res.status(err.status).json({ error: err.message });
      logger.error({ err, organizationId, clerkUserId, requestId }, '[InternalOperator] request cancel failed');
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

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
      const context = await loadLiveOperatorContext(
        organizationId,
        memberKey,
        await getContext(organizationId, memberKey),
      );
      const plan = context.pendingPlans.find((pending) => pending.planId === planId);
      if (!plan) {
        return res.status(409).json({ error: 'That plan is no longer waiting on you.' });
      }

      if (decision === 'dismiss') {
        await clearPendingPlan(organizationId, memberKey, clerkUserId, plan);
        return res.status(200).json({ summary: 'Plan dismissed.' });
      }

      if (isPendingPlanInvalid(plan)) {
        return res.status(400).json({
          error: 'This draft failed validation and cannot be approved. Revise it, dismiss it, or take over in the dashboard.',
        });
      }

      const identity = expectedPlanIdentity(plan);
      const { summary } = await runApprovedPendingPlan({
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
