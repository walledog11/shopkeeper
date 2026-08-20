import logger from '../logger.js';
import { parseProductAnalyticsConfig } from '@shopkeeper/analytics';
import {
  parseGatewayProductionConfig,
  type EmailInboundMode,
} from '../../../../scripts/lib/production-config-schema.mjs';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'REDIS_URL',
  'ANTHROPIC_API_KEY',
  'INTERNAL_API_SECRET',
] as const;

function hasEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

export type { EmailInboundMode } from '../../../../scripts/lib/production-config-schema.mjs';

export function getEmailInboundMode(): EmailInboundMode {
  return parseGatewayProductionConfig(process.env).emailInboundMode;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[Gateway] Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getInternalApiSecret(): string {
  return requireEnv('INTERNAL_API_SECRET');
}

// Both optional on purpose. The gateway only needs these to tell a Starter
// subscription from a Pro one; with neither set, every org resolves to the
// unknown tier, which is unbounded, so the conversation cap stays inert until
// the prices actually exist in Stripe.
export function getBillingPriceIds(): { starter?: string; pro?: string } {
  const starter = process.env.PRICE_ID_STARTER?.trim();
  const pro = process.env.PRICE_ID_PRO?.trim();
  return {
    ...(starter ? { starter } : {}),
    ...(pro ? { pro } : {}),
  };
}

export function getGatewayDashboardUrl(): string {
  const config = parseGatewayProductionConfig(process.env);
  const url = config.dashboardUrl || config.dashboardInternalUrl;
  if (!url) {
    throw new Error('[Gateway] Missing required environment variable: DASHBOARD_URL');
  }
  return url;
}

export function validateGatewayEnv(): void {
  const productionConfig = parseGatewayProductionConfig(process.env);
  const missing = REQUIRED_ENV.filter((name) => !hasEnv(name));
  if (missing.length > 0) {
    throw new Error(`[Gateway] Missing required environment variables: ${missing.join(', ')}`);
  }

  getGatewayDashboardUrl();

  if (process.env.NODE_ENV === 'production' && !hasEnv('DASHBOARD_URL')) {
    throw new Error('[Gateway] Missing required environment variable: DASHBOARD_URL');
  }

  if (process.env.NODE_ENV === 'production' && !hasEnv('TOKEN_ENCRYPTION_KEY')) {
    throw new Error('[Gateway] Missing required environment variable: TOKEN_ENCRYPTION_KEY');
  }

  if (process.env.NODE_ENV === 'production' && !hasEnv('DIRECT_DATABASE_URL')) {
    throw new Error('[Gateway] Missing required environment variable: DIRECT_DATABASE_URL');
  }

  if (process.env.NODE_ENV === 'production' && !hasEnv('PLAN_EXECUTION_LEDGER_MODE')) {
    throw new Error('[Gateway] Missing required environment variable: PLAN_EXECUTION_LEDGER_MODE');
  }

  if (process.env.NODE_ENV === 'production' && !hasEnv('AGENT_CONTEXT_BUDGET_MODE')) {
    throw new Error('[Gateway] Missing required environment variable: AGENT_CONTEXT_BUDGET_MODE');
  }

  parseProductAnalyticsConfig();

  const redisUrl = requireEnv('REDIS_URL');
  try {
    if (new URL(redisUrl).hostname.endsWith('upstash.io')) {
      logger.warn('[Gateway] REDIS_URL points at an Upstash host. BullMQ holds a blocking connection per worker and polls continuously, so on Upstash pay-as-you-go (per-command) billing this produces runaway cost even with zero traffic. Use a dedicated per-instance Redis (Railway Redis, Redis Cloud, ElastiCache, or an Upstash fixed plan).');
    }
  } catch {
    // URL parse failure is surfaced by the ioredis client; nothing to guard here.
  }

  const dbUrl = requireEnv('DATABASE_URL');
  if (!dbUrl.includes('pgbouncer=true')) {
    logger.warn('[Gateway] DATABASE_URL is missing pgbouncer=true — add it to avoid connection exhaustion in production');
  }
  if (!dbUrl.includes('connection_limit=')) {
    logger.warn('[Gateway] DATABASE_URL is missing connection_limit — add it (e.g. connection_limit=1) to avoid connection exhaustion in production');
  }

  if (process.env.NODE_ENV === 'production') {
    const directDbUrl = requireEnv('DIRECT_DATABASE_URL');
    if (directDbUrl.includes('pgbouncer=true') || directDbUrl.includes('-pooler')) {
      logger.warn('[Gateway] DIRECT_DATABASE_URL must use the direct Neon host, not the pooler');
    }
  }

  if (process.env.NODE_ENV === 'production' && hasEnv('DASHBOARD_INTERNAL_URL')) {
    logger.warn('[Gateway] DASHBOARD_INTERNAL_URL is set in production. Prefer DASHBOARD_URL and reserve DASHBOARD_INTERNAL_URL for local callback forwarding.');
  }

  // Postmark inbound auth is required whenever the forwarding rail is active
  // (hybrid/postmark). gmail-only boots without it for dev / future native-only.
  if (process.env.NODE_ENV === 'production' && productionConfig.emailInboundMode !== 'gmail-only') {
    if (!hasEnv('POSTMARK_INBOUND_USERNAME')) {
      throw new Error('[Gateway] Missing required environment variable: POSTMARK_INBOUND_USERNAME');
    }
    if (!hasEnv('POSTMARK_INBOUND_PASSWORD')) {
      throw new Error('[Gateway] Missing required environment variable: POSTMARK_INBOUND_PASSWORD');
    }
  }
}
