import express from 'express';
import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import { db } from '@clerk/db';
import webhookRoutes from './routes/webhooks.js';
import logger from './logger.js';

// Load environment variables from your apps/gateway/.env file
dotenv.config();

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
app.get('/', async (_req, res) => {
  try {
    const customerCount = await db.customer.count();
    res.status(200).json({
      status: 'Clerk Gateway is running 🟢',
      customersInDatabase: customerCount,
    });
  } catch (error) {
    logger.error({ err: error }, 'Database connection failed');
    res.status(500).json({ status: 'Database connection failed 🔴' });
  }
});

app.use('/webhooks', webhookRoutes);

app.listen(PORT, () => {
  logger.info({ port: PORT }, '[Clerk Gateway] Server listening');
});
