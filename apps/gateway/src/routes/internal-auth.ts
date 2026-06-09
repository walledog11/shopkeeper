import type { Request, Response } from 'express';
import { getInternalApiSecret } from '../config/env.js';
import { safeEqual } from '../lib/crypto.js';
import logger from '../logger.js';

export function authorizeInternalRequest(req: Request, res: Response, logContext: string): boolean {
  const incomingSecret = req.headers['x-internal-secret'];
  const secret = Array.isArray(incomingSecret) ? incomingSecret[0] : incomingSecret;
  if (!secret || typeof secret !== 'string') {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  let expectedSecrets: string[];
  try {
    expectedSecrets = [
      getInternalApiSecret(),
      process.env.INTERNAL_API_SECRET_PREV?.trim(),
    ].filter((value): value is string => Boolean(value));
  } catch (err) {
    logger.error({ err: (err as Error).message }, `[${logContext}] missing INTERNAL_API_SECRET`);
    res.status(500).json({ error: 'Server misconfigured' });
    return false;
  }

  if (!expectedSecrets.some((expected) => safeEqual(secret, expected))) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}
