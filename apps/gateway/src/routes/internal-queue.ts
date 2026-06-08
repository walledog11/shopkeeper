import express, { type Request, type Response, type Router } from 'express';
import logger from '../logger.js';
import { createGatewayRedisClient } from '../clients/redis-client.js';
import { clearQueueDiagnosticsCache } from '../health.js';
import { removeFailedQueueJob } from '../queue-maintenance.js';
import { authorizeInternalRequest } from './internal-auth.js';

export function registerInternalQueueRoutes(router: Router): void {
  router.post('/queue/remove-failed', async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalQueue')) return;

    const body = req.body as { queue?: unknown; jobId?: unknown };
    const queue = typeof body.queue === 'string' ? body.queue.trim() : '';
    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    if (!queue || !jobId) {
      return res.status(400).json({ error: 'queue and jobId are required' });
    }

    const redis = createGatewayRedisClient();
    try {
      const removed = await removeFailedQueueJob(redis, queue, jobId);
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
    } finally {
      await redis.quit().catch(() => redis.disconnect());
    }
  });
}

const router = express.Router();
registerInternalQueueRoutes(router);
export default router;
