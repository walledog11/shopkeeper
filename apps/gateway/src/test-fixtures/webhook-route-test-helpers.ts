import { createHmac } from 'crypto';
import express, { type Router } from 'express';
import type { Mock } from 'vitest';
import { bodyLimitErrorHandler } from '../routes/body-parsers.js';

export interface MockLogger {
  debug: Mock;
  error: Mock;
  info: Mock;
  warn: Mock;
}

// Mirrors the production shape: no application-wide parser, so each route runs
// under the P4-05 budget it mounts for itself.
export function createWebhookRouterApp(router: Router) {
  const app = express();
  app.use('/webhooks', router);
  app.use(bodyLimitErrorHandler);
  return app;
}

export function createRegisteredWebhookRouterApp(registerRoutes: (router: Router) => void) {
  const router = express.Router();
  registerRoutes(router);
  return createWebhookRouterApp(router);
}

export function hmacSha256(secret: string, body: string) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function hmacSha256Base64(secret: string, body: Buffer | string) {
  return createHmac('sha256', secret).update(body).digest('base64');
}

export function clearMockLogger(mockLogger: MockLogger) {
  mockLogger.debug.mockClear();
  mockLogger.error.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
}
