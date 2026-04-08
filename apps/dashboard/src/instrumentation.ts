import * as Sentry from '@sentry/nextjs';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'INTERNAL_API_SECRET',
];

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.SENTRY_DSN) {
      Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'production' });
    }

    const missing = REQUIRED_ENV.filter(k => !process.env[k]);
    if (missing.length > 0) {
      throw new Error(`[Dashboard] Missing required environment variables: ${missing.join(', ')}`);
    }

    // Neon PostgreSQL requires pgbouncer=true and connection_limit in the DATABASE_URL
    // to avoid exhausting connections under serverless load.
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl.includes('pgbouncer=true')) {
      console.warn('[Dashboard] DATABASE_URL is missing pgbouncer=true — add it to avoid connection exhaustion in production');
    }
    if (!dbUrl.includes('connection_limit=')) {
      console.warn('[Dashboard] DATABASE_URL is missing connection_limit — add it (e.g. connection_limit=1) to avoid connection exhaustion in production');
    }

    const dns = await import('dns');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
}
