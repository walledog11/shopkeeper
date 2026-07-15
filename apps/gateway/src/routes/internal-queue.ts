import express, { type Request, type Response, type Router } from 'express';
import { db } from '@shopkeeper/db';
import logger from '../logger.js';
import { clearQueueDiagnosticsCache } from '../health.js';
import { removeFailedQueueJob } from '../queue-maintenance.js';
import { getGatewayBullMqQueue } from '../clients/gateway-queues.js';
import { JOB, QUEUE } from '../constants.js';
import type {
  OutboundEmailJobData,
  OutboundEmailSource,
} from '../types.js';
import { authorizeInternalRequest } from './internal-auth.js';

const OUTBOUND_EMAIL_SOURCES: ReadonlySet<OutboundEmailSource> = new Set([
  'dispatch_message',
  'agent_send_reply',
  'agent_send_email',
  'auto_ack',
]);

export function registerInternalQueueRoutes(router: Router): void {
  // Phase 1.5 enqueue path (option A): the dashboard pre-creates the pending
  // message row, then enqueues the actual provider send here so it inherits the
  // gateway's BullMQ retries. Preserves the Redis split — no dashboard access to
  // the gateway's ioredis.
  router.post('/queue/outbound-email', async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalQueue')) return;

    const body = req.body as Record<string, unknown>;
    const organizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
    const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
    const threadId = typeof body.threadId === 'string' ? body.threadId.trim() : '';
    const integrationId = typeof body.integrationId === 'string' ? body.integrationId.trim() : '';
    const source = body.source as OutboundEmailSource;
    const replySource = body.replySource === 'manual'
      || body.replySource === 'agent_approved'
      || body.replySource === 'agent_automatic'
      ? body.replySource
      : undefined;
    const traceId = typeof body.traceId === 'string' ? body.traceId.trim() : undefined;

    if (!organizationId || !messageId || !threadId || !integrationId) {
      return res.status(400).json({
        error: 'organizationId, messageId, threadId, and integrationId are required',
      });
    }
    if (!OUTBOUND_EMAIL_SOURCES.has(source)) {
      return res.status(400).json({ error: 'invalid source' });
    }

    const [message, integration] = await Promise.all([
      db.message.findFirst({
        where: {
          id: messageId,
          organizationId,
          threadId,
          thread: { organizationId },
        },
        select: {
          id: true,
          threadId: true,
          organizationId: true,
          sendStatus: true,
          integrationId: true,
        },
      }),
      db.integration.findFirst({
        where: { id: integrationId, organizationId, platform: 'email' },
        select: { id: true, organizationId: true },
      }),
    ]);
    if (!message || !integration || message.integrationId !== integration.id) {
      return res.status(404).json({ error: 'Outbound email resources not found' });
    }

    const jobData: OutboundEmailJobData = {
      organizationId: message.organizationId,
      messageId: message.id,
      threadId: message.threadId,
      integrationId: integration.id,
      source,
      ...(replySource && { replySource }),
      ...(traceId && { traceId }),
    };

    try {
      const queue = getGatewayBullMqQueue(QUEUE.OUTBOUND_EMAIL);
      const existingJob = await queue.getJob(message.id);
      if (existingJob) {
        const state = await existingJob.getState();
        if (message.sendStatus === 'pending' && (state === 'failed' || state === 'completed')) {
          await existingJob.remove();
        } else {
          logger.info(
            { messageId, source, jobId: existingJob.id, state },
            '[InternalQueue] Outbound email already enqueued',
          );
          return res.status(202).json({ enqueued: true, jobId: existingJob.id, deduplicated: true });
        }
      }
      const job = await queue.add(JOB.SEND_EMAIL, jobData, { jobId: message.id });
      logger.info({ messageId, source, jobId: job.id }, '[InternalQueue] Enqueued outbound email');
      return res.status(202).json({ enqueued: true, jobId: job.id });
    } catch (err) {
      logger.error(
        { err: (err as Error).message, messageId, source },
        '[InternalQueue] outbound-email enqueue error',
      );
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.post('/queue/remove-failed', async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalQueue')) return;

    const body = req.body as { queue?: unknown; jobId?: unknown };
    const queue = typeof body.queue === 'string' ? body.queue.trim() : '';
    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    if (!queue || !jobId) {
      return res.status(400).json({ error: 'queue and jobId are required' });
    }

    try {
      const removed = await removeFailedQueueJob(queue, jobId);
      if (!removed) {
        return res.status(404).json({ error: 'Failed job not found' });
      }

      clearQueueDiagnosticsCache();
      logger.info({ queue, jobId }, '[InternalQueue] Removed failed job');
      return res.status(200).json({ removed: true, queue, jobId });
    } catch (err) {
      logger.error(
        { err: (err as Error).message, queue, jobId },
        '[InternalQueue] remove-failed handler error',
      );
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });
}

const router = express.Router();
registerInternalQueueRoutes(router);
export default router;
