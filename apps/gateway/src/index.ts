import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env'), override: true });

import express from 'express';
import * as Sentry from '@sentry/node';
import { db } from '@clerk/db';
import webhookRoutes from './routes/webhooks.js';
import logger from './logger.js';

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'production' });
}

const REQUIRED_ENV = [
  'DATABASE_URL',
  'REDIS_URL',
  'ANTHROPIC_API_KEY',
  'INTERNAL_API_SECRET',
  'META_APP_SECRET',
];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`[Clerk Gateway] Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl.includes('pgbouncer=true')) {
  logger.warn('[Gateway] DATABASE_URL is missing pgbouncer=true — add it to avoid connection exhaustion in production');
}
if (!dbUrl.includes('connection_limit=')) {
  logger.warn('[Gateway] DATABASE_URL is missing connection_limit — add it (e.g. connection_limit=1) to avoid connection exhaustion in production');
}

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware to parse incoming JSON payloads and capture raw body for signature verification
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

// Twilio sends webhooks as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

// A simple health-check route to prove the server is alive
app.get('/', (_req, res) => {
  res.status(200).json({ status: 'Clerk Gateway is running 🟢' });
});

// Deep health check — verifies DB and Redis connectivity
app.get('/health/deep', async (_req, res) => {
  const checks: Record<string, string> = {};
  let ok = true;

  try {
    await db.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch (err) {
    checks.db = 'error';
    ok = false;
    logger.error({ err }, '[Health] DB check failed');
  }

  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
});

app.use('/webhooks', webhookRoutes);

// During local dev, ngrok points to this gateway (port 8080) but dashboard OAuth
// callbacks arrive here. Forward them to the dashboard so the OAuth flow completes.
const dashboardUrl = process.env.DASHBOARD_INTERNAL_URL;
if (dashboardUrl) {
  app.get('/api/integrations/:platform/callback', (req, res) => {
    res.redirect(dashboardUrl + req.url);
  });

  // Forward any /dashboard/* paths so post-OAuth redirects land correctly.
  app.get('/dashboard/{*path}', (req, res) => {
    res.redirect(dashboardUrl + req.url);
  });
}

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, '[Clerk Gateway] Server listening');
});

// Graceful shutdown — Railway sends SIGTERM before killing the container.
// Stop accepting new connections and let in-flight requests finish.
process.on('SIGTERM', () => {
  logger.info('[Clerk Gateway] SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('[Clerk Gateway] HTTP server closed');
    process.exit(0);
  });
});
