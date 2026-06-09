import express, { type Request, type Response, type Router } from 'express';
import logger from '../logger.js';
import { pushOperatorEscalation } from '../operator-escalation.js';
import { authorizeInternalRequest } from './internal-auth.js';

export function registerInternalOperatorRoutes(router: Router): void {
  router.post('/operator/escalate', async (req: Request, res: Response) => {
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
}

const router = express.Router();
registerInternalOperatorRoutes(router);
export default router;
