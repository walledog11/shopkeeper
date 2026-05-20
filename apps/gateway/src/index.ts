import express from 'express';
import * as Sentry from '@sentry/node';
import { db } from '@clerk/db';
import webhookRoutes from './routes/webhooks.js';
import internalOperatorRoutes from './routes/internal-operator.js';
import { getGatewayDashboardUrl, validateGatewayEnv } from './config/env.js';
import { getQueueDiagnostics, readWorkerHeartbeat } from './health.js';
import logger from './logger.js';
import { createGatewayRedisClient } from './clients/redis-client.js';
import { runGatewayEntry } from './bootstrap.js';
import { sentryBeforeSend } from './observability/redaction.js';

export function createGatewayApp() {
  const app = express();

  // Middleware to parse incoming JSON payloads and capture raw body for signature verification.
  // Postmark inbound emails can be up to 35MB with attachments — keep headroom above that.
  app.use(express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }));

  app.use(express.urlencoded({ extended: false, limit: '50mb' }));

  // A simple health-check route to prove the server is alive
  app.get('/', (_req, res) => {
    res.status(200).json({ status: 'Clerk Gateway is running 🟢' });
  });

  return app;
}

export async function startGatewayServer() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      sendDefaultPii: false,
      beforeSend: sentryBeforeSend,
    });
  }

  validateGatewayEnv();

  const app = createGatewayApp();
  const PORT = process.env.PORT || 8080;
  const healthRedis = createGatewayRedisClient();

  healthRedis.on('error', (err: Error) => {
    logger.error({ err: err.message }, '[Health] Redis connection error');
  });

  // Deep health check — verifies DB, Redis, worker heartbeat, and queue readiness
  app.get('/health/deep', async (_req, res) => {
    const checks: Record<string, unknown> = {};
    let ok = true;

    try {
      await db.$queryRaw`SELECT 1`;
      checks.db = { status: 'ok' };
    } catch (err) {
      checks.db = { status: 'error' };
      ok = false;
      logger.error({ err }, '[Health] DB check failed');
    }

    try {
      const pong = await healthRedis.ping();
      checks.redis = { status: pong === 'PONG' ? 'ok' : 'error' };
      if (pong !== 'PONG') ok = false;
    } catch (err) {
      checks.redis = { status: 'error' };
      ok = false;
      logger.error({ err }, '[Health] Redis check failed');
    }

    try {
      const heartbeat = await readWorkerHeartbeat(healthRedis);
      checks.worker = {
        status: heartbeat.healthy ? 'ok' : 'error',
        ageMs: heartbeat.ageMs,
        pid: heartbeat.payload?.pid ?? null,
        timestamp: heartbeat.payload?.timestamp ?? null,
      };
      if (!heartbeat.healthy) ok = false;
    } catch (err) {
      checks.worker = { status: 'error' };
      ok = false;
      logger.error({ err }, '[Health] Worker heartbeat check failed');
    }

    try {
      const queueCounts = await getQueueDiagnostics(healthRedis);
      checks.queues = { status: 'ok', counts: queueCounts };
    } catch (err) {
      checks.queues = { status: 'error' };
      ok = false;
      logger.error({ err }, '[Health] Queue diagnostics failed');
    }

    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
  });

  app.get('/health/queues', async (_req, res) => {
    try {
      const heartbeat = await readWorkerHeartbeat(healthRedis);
      const queueCounts = await getQueueDiagnostics(healthRedis);

      res.status(200).json({
        worker: {
          healthy: heartbeat.healthy,
          ageMs: heartbeat.ageMs,
          pid: heartbeat.payload?.pid ?? null,
          timestamp: heartbeat.payload?.timestamp ?? null,
        },
        queues: queueCounts,
      });
    } catch (err) {
      logger.error({ err }, '[Health] Queue diagnostics endpoint failed');
      res.status(503).json({ error: 'Failed to read queue diagnostics' });
    }
  });

  app.use('/webhooks', webhookRoutes);
  app.use('/internal', internalOperatorRoutes);

  // During local dev, ngrok points to this gateway (port 8080) but dashboard OAuth
  // callbacks arrive here. Forward them to the dashboard so the OAuth flow completes.
  const dashboardInternalUrl = process.env.DASHBOARD_INTERNAL_URL;
  if (dashboardInternalUrl) {
    app.get('/api/integrations/:platform/callback', (req, res) => {
      res.redirect(dashboardInternalUrl + req.url);
    });

    // Forward any /dashboard/* paths so post-OAuth redirects land correctly.
    app.get('/dashboard/{*path}', (req, res) => {
      res.redirect(dashboardInternalUrl + req.url);
    });
  }

  const dashboardUrl = getGatewayDashboardUrl();
  logger.info({ dashboardUrl }, '[Gateway] Dashboard base URL configured');

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, '[Clerk Gateway] Server listening');
  });

  const shutdown = () => {
    const forceExit = setTimeout(() => {
      logger.warn('[Clerk Gateway] Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 25_000);
    forceExit.unref();

    logger.info('[Clerk Gateway] Shutting down gracefully');
    server.closeAllConnections?.();
    server.close(async () => {
      logger.info('[Clerk Gateway] HTTP server closed');
      await db.$disconnect().catch(() => {});
      healthRedis.quit().catch(() => healthRedis.disconnect()).finally(() => {
        clearTimeout(forceExit);
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { app, server, shutdown };
}

await runGatewayEntry(import.meta.url, '[Gateway] Failed startup env validation', startGatewayServer);
