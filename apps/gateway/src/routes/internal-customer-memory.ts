import express, { type Request, type Response, type Router } from 'express';
import { Queue } from 'bullmq';
import logger from '../logger.js';
import { JOB, PROCESSING_QUEUE_DEFAULTS, QUEUE } from '../constants.js';
import { createGatewayBullMqConnection } from '../clients/redis-client.js';
import type { CustomerMemoryJobData } from '../types.js';
import { enqueueCustomerMemoryThreadClose } from '../maintenance/customer-memory.js';
import { authorizeInternalRequest } from './internal-auth.js';

const MAX_THREAD_IDS = 100;

let customerMemoryQueue: Queue<CustomerMemoryJobData> | null = null;

interface ThreadCloseTarget {
  threadId: string;
  closedAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getCustomerMemoryQueue(): Queue<CustomerMemoryJobData> {
  if (!customerMemoryQueue) {
    const redisConnection = createGatewayBullMqConnection();
    customerMemoryQueue = new Queue<CustomerMemoryJobData>(QUEUE.CUSTOMER_MEMORY, {
      connection: redisConnection,
      defaultJobOptions: PROCESSING_QUEUE_DEFAULTS,
    });
  }
  return customerMemoryQueue;
}

function readThreadTargets(body: { threadId?: unknown; threadIds?: unknown; threads?: unknown }): ThreadCloseTarget[] {
  const byThreadId = new Map<string, ThreadCloseTarget>();

  const add = (target: ThreadCloseTarget) => {
    if (target.threadId.length === 0) return;
    byThreadId.set(target.threadId, target);
  };

  const rawThreadIds = Array.isArray(body.threadIds) ? body.threadIds : [body.threadId];
  for (const id of rawThreadIds) {
    if (typeof id !== 'string') continue;
    add({ threadId: id.trim() });
  }

  if (Array.isArray(body.threads)) {
    for (const item of body.threads) {
      if (!isRecord(item) || typeof item.threadId !== 'string') continue;
      const threadId = item.threadId.trim();
      const closedAt = typeof item.closedAt === 'string' && item.closedAt.trim()
        ? item.closedAt.trim()
        : undefined;
      add({ threadId, ...(closedAt ? { closedAt } : {}) });
    }
  }

  return [...byThreadId.values()];
}

export function registerInternalCustomerMemoryRoutes(router: Router): void {
  router.post('/customer-memory/thread-close', async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalCustomerMemory')) return;

    const body = req.body as { organizationId?: unknown; threadId?: unknown; threadIds?: unknown; threads?: unknown };
    const organizationId = typeof body.organizationId === 'string' ? body.organizationId : undefined;
    const targets = readThreadTargets(body);

    if (targets.length === 0) {
      return res.status(400).json({ error: 'threadId, threadIds, or threads is required' });
    }
    if (targets.length > MAX_THREAD_IDS) {
      return res.status(400).json({ error: `Too many threadIds - max ${MAX_THREAD_IDS}` });
    }

    try {
      const queue = getCustomerMemoryQueue();
      await Promise.all(targets.map((target) => enqueueCustomerMemoryThreadClose(queue, {
        threadId: target.threadId,
        ...(organizationId ? { organizationId } : {}),
        ...(target.closedAt ? { closedAt: target.closedAt } : {}),
      })));

      logger.info(
        { organizationId, count: targets.length },
        '[InternalCustomerMemory] Enqueued customer memory update',
      );
      return res.status(200).json({ enqueued: targets.length, job: JOB.UPDATE_CUSTOMER_MEMORY });
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), organizationId, count: targets.length },
        '[InternalCustomerMemory] Failed to enqueue customer memory update',
      );
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });
}

const router = express.Router();
registerInternalCustomerMemoryRoutes(router);
export default router;
