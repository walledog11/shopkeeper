import express from 'express';
import { db } from '@shopkeeper/db';
import webhookRoutes from './routes/webhooks.js';
import { bodyLimitErrorHandler } from './routes/body-parsers.js';
import internalOperatorRoutes from './routes/internal-operator.js';
import internalQueueRoutes from './routes/internal-queue.js';
import { getGatewayDashboardUrl, validateGatewayEnv } from './config/env.js';
import { registerHealthRoutes } from './health.js';
import logger from './logger.js';
import { closeGatewayBullMqQueues } from './clients/gateway-queues.js';
import { closeGatewayRedisConnections, getGatewayRedis } from './clients/redis-client.js';
import { stopAllSpectrumApps } from './clients/spectrum.js';
import { mountRealtime } from './realtime/sse.js';
import { runGatewayEntry } from './bootstrap.js';
import {
  createProductAnalyticsShutdownResource,
  initializeGatewayProductAnalytics,
} from './product-analytics.js';

export function createGatewayApp() {
  const app = express();

  // P4-05: no application-wide body parser. Each route mounts its own budget
  // (see routes/body-parsers.ts) so only Postmark inbound email can allocate an
  // attachment-sized payload.

  // A simple health-check route to prove the server is alive
  app.get('/', (_req, res) => {
    res.status(200).json({ status: 'Shopkeeper Gateway is running 🟢' });
  });

  return app;
}

export async function startGatewayServer() {
  validateGatewayEnv();
  initializeGatewayProductAnalytics();

  const app = createGatewayApp();
  const PORT = process.env.PORT || 8080;
  const healthRedis = getGatewayRedis();

  // Deep health check (public liveness) + auth-gated queue diagnostics.
  registerHealthRoutes(app, { redis: healthRedis });

  app.use('/webhooks', webhookRoutes);
  app.use('/internal', internalOperatorRoutes);
  app.use('/internal', internalQueueRoutes);

  // Live dashboard updates: holds browser SSE connections on this (server-role)
  // process and pushes Redis-published thread events. No-op unless enabled.
  mountRealtime(app);

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

  app.use(bodyLimitErrorHandler);

  const dashboardUrl = getGatewayDashboardUrl();
  logger.info({ dashboardUrl }, '[Gateway] Dashboard base URL configured');

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, '[Shopkeeper Gateway] Server listening');
  });

  const shutdown = () => {
    const forceExit = setTimeout(() => {
      logger.warn('[Shopkeeper Gateway] Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 25_000);
    forceExit.unref();

    logger.info('[Shopkeeper Gateway] Shutting down gracefully');
    server.closeAllConnections?.();
    server.close(async () => {
      logger.info('[Shopkeeper Gateway] HTTP server closed');
      await db.$disconnect().catch(() => {});
      Promise.all([
        stopAllSpectrumApps(),
        closeGatewayBullMqQueues(),
        closeGatewayRedisConnections(),
        createProductAnalyticsShutdownResource().close(),
      ]).finally(() => {
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
