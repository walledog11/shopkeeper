import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateProductionEnv } from './check-production-env.mjs';

function createDashboardLaunchEnv(overrides = {}) {
  return {
    DATABASE_URL: 'postgresql://prod.example/db?pgbouncer=true&connection_limit=1',
    CLERK_SECRET_KEY: 'sk_test_clerk',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_clerk',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    INTERNAL_API_SECRET: 'test-internal-secret',
    APP_URL: 'https://app.example.com',
    NEXT_PUBLIC_APP_URL: 'https://app.example.com',
    UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
    UPSTASH_REDIS_REST_TOKEN: 'redis-token',
    GATEWAY_INTERNAL_URL: 'https://gateway.example.com',
    POSTMARK_API_KEY: 'postmark-key',
    INBOUND_EMAIL_DOMAIN: 'mail.example.com',
    META_APP_ID: 'meta-app-id',
    META_APP_SECRET: 'meta-app-secret',
    META_CONFIG_ID: 'meta-config-id',
    SHOPIFY_CLIENT_ID: 'shopify-client-id',
    SHOPIFY_CLIENT_SECRET: 'shopify-client-secret',
    SHOPIFY_APP_SECRET: 'shopify-app-secret',
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'twilio-token',
    TWILIO_FROM_NUMBER: '+15555550123',
    TWILIO_WEBHOOK_URL: 'https://gateway.example.com/webhooks/twilio',
    STRIPE_SECRET_KEY: 'sk_live_stripe',
    STRIPE_WEBHOOK_SECRET: 'whsec_live_stripe',
    PRICE_ID_STARTER: 'price_starter',
    PRICE_ID_PRO: 'price_pro',
    ...overrides,
  };
}

function createGatewayLaunchEnv(overrides = {}) {
  return {
    DATABASE_URL: 'postgresql://prod.example/db?pgbouncer=true&connection_limit=1',
    REDIS_URL: 'rediss://redis.example.com:6379/0',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    INTERNAL_API_SECRET: 'test-internal-secret',
    DASHBOARD_URL: 'https://app.example.com',
    META_APP_SECRET: 'meta-app-secret',
    META_VERIFY_TOKEN: 'verify-token',
    META_APP_ID: 'meta-app-id',
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'twilio-token',
    TWILIO_WHATSAPP_NUMBER: 'whatsapp:+15555550123',
    TWILIO_WEBHOOK_URL: 'https://gateway.example.com/webhooks/twilio',
    SHOPIFY_APP_SECRET: 'shopify-app-secret',
    ...overrides,
  };
}

test('dashboard launch contract passes with the expected production env', () => {
  const result = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv(),
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('dashboard launch contract rejects mismatched app URLs', () => {
  const result = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({
      NEXT_PUBLIC_APP_URL: 'https://www.example.com',
    }),
  });

  assert.equal(result.errors.includes('APP_URL and NEXT_PUBLIC_APP_URL must match'), true);
});

test('dashboard launch contract allows NEXT_PUBLIC_APP_URL to be omitted', () => {
  const result = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({
      NEXT_PUBLIC_APP_URL: '',
    }),
  });

  assert.deepEqual(result.errors, []);
});

test('dashboard launch contract warns on deprecated GATEWAY_PUBLIC_URL usage', () => {
  const result = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({
      GATEWAY_PUBLIC_URL: 'https://gateway.example.com',
    }),
  });

  assert.equal(
    result.warnings.includes(
      'GATEWAY_PUBLIC_URL is deprecated; use GATEWAY_INTERNAL_URL as the canonical dashboard gateway base URL'
    ),
    true
  );
});

test('gateway launch contract requires the Twilio webhook path to match the gateway route', () => {
  const result = validateProductionEnv('gateway', {
    scope: 'launch',
    env: createGatewayLaunchEnv({
      TWILIO_WEBHOOK_URL: 'https://gateway.example.com/hooks/twilio',
    }),
  });

  assert.equal(result.errors.includes('TWILIO_WEBHOOK_URL must point to /webhooks/twilio'), true);
});

test('gateway launch contract warns when Redis is not configured with TLS', () => {
  const result = validateProductionEnv('gateway', {
    scope: 'launch',
    env: createGatewayLaunchEnv({
      REDIS_URL: 'redis://redis.example.com:6379/0',
    }),
  });

  assert.equal(
    result.warnings.includes('REDIS_URL is not using the TLS rediss:// form'),
    true
  );
});

test('env file parser trims comments and quoted values the same way prod env files are written', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'clerk-env-check-'));
  const envFile = join(tempDir, 'gateway.env');
  writeFileSync(
    envFile,
    [
      'DATABASE_URL="postgresql://prod.example/db?pgbouncer=true&connection_limit=1"',
      'REDIS_URL=rediss://redis.example.com:6379/0',
      'ANTHROPIC_API_KEY=test-anthropic-key',
      'INTERNAL_API_SECRET=test-internal-secret',
      'DASHBOARD_URL=https://app.example.com',
      'META_APP_SECRET=meta-app-secret',
      'META_VERIFY_TOKEN=verify-token',
      'META_APP_ID=meta-app-id',
      'TWILIO_ACCOUNT_SID=AC123',
      'TWILIO_AUTH_TOKEN=twilio-token',
      'TWILIO_WHATSAPP_NUMBER=whatsapp:+15555550123   # live number',
      'TWILIO_WEBHOOK_URL=https://gateway.example.com/webhooks/twilio',
      'SHOPIFY_APP_SECRET=shopify-app-secret',
      '',
    ].join('\n')
  );

  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(
    process.execPath,
    ['scripts/check-production-env.mjs', 'gateway', '--scope=launch', `--env-file=${envFile}`],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Gateway \(launch\): OK/);
});
