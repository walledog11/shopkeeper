import express, { type Request, type Response, type Router } from 'express';
import { getGatewayRuntimeFlags } from '../config/runtime-config.js';
import { authorizeInternalRequest } from './internal-auth.js';

export function registerInternalRuntimeRoutes(router: Router): void {
  router.get('/runtime-flags', (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalRuntime')) return;
    return res.status(200).json(getGatewayRuntimeFlags());
  });
}

const router = express.Router();
registerInternalRuntimeRoutes(router);
export default router;
