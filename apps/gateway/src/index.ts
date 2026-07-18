import express from 'express';
import { db } from '@shopkeeper/db';
import webhookRoutes from './routes/webhooks.js';
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
