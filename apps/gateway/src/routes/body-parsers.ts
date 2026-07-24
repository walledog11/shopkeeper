import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { getGatewayBodyLimits } from '../config/runtime-config.js';
import logger from '../logger.js';

function captureRawBody(req: Request, _res: unknown, buf: Buffer): void {
  req.rawBody = buf;
}

// Signed provider webhooks (Telegram, Meta, Shopify, Photon, TikTok, Gmail).
// Keeps the raw buffer because their HMAC/signature checks verify over it.
export function webhookJsonParser(): RequestHandler {
  return express.json({
    limit: getGatewayBodyLimits().webhookBytes,
    verify: captureRawBody,
  });
}

// Postmark inbound email, the only route that legitimately carries attachment
// payloads. No raw-body capture: the route authenticates with basic auth rather
// than a signature, so retaining the buffer would double the peak allocation.
export function emailInboundJsonParser(): RequestHandler {
  return express.json({ limit: getGatewayBodyLimits().emailInboundBytes });
}

export function emailInboundUrlencodedParser(): RequestHandler {
  return express.urlencoded({ extended: false, limit: getGatewayBodyLimits().emailInboundBytes });
}

// Dashboard -> gateway internal routes, which carry identifiers and short
// strings only.
export function internalJsonParser(): RequestHandler {
  return express.json({ limit: getGatewayBodyLimits().internalBytes });
}

// Body-parser rejections would otherwise render Express's default HTML error
// page. Answer in JSON and keep the rejected size/type in the logs so an
// oversized provider payload is diagnosable without a repro.
export function bodyLimitErrorHandler(
  err: Error & { type?: string; length?: number; limit?: number },
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err?.type !== 'entity.too.large') {
    return next(err);
  }

  logger.warn(
    {
      path: req.path,
      contentType: req.headers['content-type'] ?? null,
      contentLength: err.length ?? null,
      limit: err.limit ?? null,
    },
    '[Gateway] Rejected oversized request body',
  );
  return res.status(413).json({ error: 'Payload too large' });
}
