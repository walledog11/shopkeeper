import { createHmac } from 'crypto';
import express, { type Router } from 'express';
import type { Mock } from 'vitest';

export interface MockLogger {
  debug: Mock;
  error: Mock;
  info: Mock;
  warn: Mock;
}

function installJsonParserWithRawBody(app: express.Express) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
}

export function createWebhookRouterApp(router: Router, options: { urlencoded?: boolean } = {}) {
  const app = express();
  installJsonParserWithRawBody(app);
  if (options.urlencoded) {
    app.use(express.urlencoded({ extended: false }));
  }
  app.use('/webhooks', router);
  return app;
}

export function createRegisteredWebhookRouterApp(
  registerRoutes: (router: Router) => void,
  options: { urlencoded?: boolean } = {},
) {
  const router = express.Router();
  registerRoutes(router);
  return createWebhookRouterApp(router, options);
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
