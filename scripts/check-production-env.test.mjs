import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateProductionEnv } from './check-production-env.mjs';

function createDashboardLaunchEnv(overrides = {}) {
  return {
    DATABASE_URL: 'postgresql://prod.example/db?pgbouncer=true&connection_limit=1',
    DIRECT_DATABASE_URL: 'postgresql://prod.example/db',
    CLERK_SECRET_KEY: 'sk_test_clerk',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_clerk',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    INTERNAL_API_SECRET: 'test-internal-secret',
    APP_URL: 'https://app.example.com',
    NEXT_PUBLIC_APP_URL: 'https://app.example.com',
    TOKEN_ENCRYPTION_KEY: '0'.repeat(64),
    UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
    UPSTASH_REDIS_REST_TOKEN: 'redis-token',
    GATEWAY_INTERNAL_URL: 'https://gateway.example.com',
    POSTMARK_API_KEY: 'postmark-key',
    INBOUND_EMAIL_DOMAIN: 'mail.example.com',
    SHOPIFY_CLIENT_ID: 'shopify-client-id',
    SHOPIFY_CLIENT_SECRET: 'shopify-client-secret',
    SHOPIFY_APP_SECRET: 'shopify-app-secret',
    STRIPE_SECRET_KEY: 'sk_live_stripe',
    STRIPE_WEBHOOK_SECRET: 'whsec_live_stripe',
    CLERK_WEBHOOK_SECRET: 'whsec_live_clerk',
    PRICE_ID_STARTER: 'price_starter',
    PRICE_ID_PRO: 'price_pro',
    BLOB_READ_WRITE_TOKEN: 'vercel-blob-token',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GMAIL_NATIVE_INBOUND: 'false',
    GMAIL_PUBSUB_TOPIC: 'projects/shopkeeper-prod/topics/gmail-inbound',
    IMESSAGE_LINE_HANDLE: '+15551234567',
    INSTAGRAM_INTEGRATION_ENABLED: 'false',
    PRODUCT_ANALYTICS_ENABLED: 'false',
    PLAN_EXECUTION_LEDGER_MODE: 'shadow',
    AGENT_CONTEXT_BUDGET_MODE: 'shadow',
    ...overrides,
  };
}

function createGatewayLaunchEnv(overrides = {}) {
  return {
    DATABASE_URL: 'postgresql://prod.example/db?pgbouncer=true&connection_limit=1',
    DIRECT_DATABASE_URL: 'postgresql://prod.example/db',
    REDIS_URL: 'rediss://redis.example.com:6379/0',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    INTERNAL_API_SECRET: 'test-internal-secret',
    DASHBOARD_URL: 'https://app.example.com',
    TOKEN_ENCRYPTION_KEY: '0'.repeat(64),
    SHOPIFY_APP_SECRET: 'shopify-app-secret',
    BLOB_READ_WRITE_TOKEN: 'vercel-blob-token',
    POSTMARK_INBOUND_USERNAME: 'postmark-inbound-user',
    POSTMARK_INBOUND_PASSWORD: 'postmark-inbound-pass',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GMAIL_NATIVE_INBOUND: 'false',
    GMAIL_PUBSUB_TOPIC: 'projects/shopkeeper-prod/topics/gmail-inbound',
    GMAIL_PUBSUB_AUDIENCE: 'https://gateway.example.com/webhooks/gmail/push',
    GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT:
      'shopkeeper-gmail-push@shopkeeper-prod.iam.gserviceaccount.com',
    SPECTRUM_PROJECT_ID: 'project_1',
    SPECTRUM_PROJECT_SECRET: 'project_secret_1',
    SPECTRUM_WEBHOOK_SECRET: 'webhook_secret_1',
    PRODUCT_ANALYTICS_ENABLED: 'false',
    PLAN_EXECUTION_LEDGER_MODE: 'shadow',
    AGENT_CONTEXT_BUDGET_MODE: 'shadow',
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

test('dashboard launch contract requires Clerk webhook signing secret', () => {
  const result = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({
      CLERK_WEBHOOK_SECRET: '',
    }),
  });

  assert.equal(
    result.errors.includes('Missing required environment variable: CLERK_WEBHOOK_SECRET'),
    true
  );
});

test('dashboard launch contract requires blob token for attachment proxy', () => {
  const result = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({
      BLOB_READ_WRITE_TOKEN: '',
    }),
  });

  assert.equal(
    result.errors.includes('Missing required environment variable: BLOB_READ_WRITE_TOKEN'),
    true
  );
});

test('dashboard launch contract validates the Instagram rollout gate and credentials', () => {
  const invalidFlag = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({ INSTAGRAM_INTEGRATION_ENABLED: 'beta' }),
  });
  assert.equal(
    invalidFlag.errors.includes('INSTAGRAM_INTEGRATION_ENABLED must be either true or false'),
    true,
  );

  const enabledWithoutCredentials = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({ INSTAGRAM_INTEGRATION_ENABLED: 'true' }),
  });
  assert.equal(
    enabledWithoutCredentials.errors.includes(
      'INSTAGRAM_APP_ID is required when INSTAGRAM_INTEGRATION_ENABLED=true',
    ),
    true,
  );
  assert.equal(
    enabledWithoutCredentials.errors.includes(
      'INSTAGRAM_APP_SECRET is required when INSTAGRAM_INTEGRATION_ENABLED=true',
    ),
    true,
  );

  const enabled = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({
      INSTAGRAM_INTEGRATION_ENABLED: 'true',
      INSTAGRAM_APP_ID: 'instagram-app-id',
      INSTAGRAM_APP_SECRET: 'instagram-app-secret',
    }),
  });
  assert.deepEqual(enabled.errors, []);
});

test('dashboard launch contract requires direct database URL for Prisma migrations', () => {
  const result = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({
      DIRECT_DATABASE_URL: '',
    }),
  });

  assert.equal(
    result.errors.includes('Missing required environment variable: DIRECT_DATABASE_URL'),
    true
  );
});

test('dashboard launch contract warns when direct database URL uses the pooler', () => {
  const result = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({
      DIRECT_DATABASE_URL: 'postgresql://ep-pooler.us-east-2.aws.neon.tech/neondb?pgbouncer=true',
    }),
  });

  assert.equal(
    result.warnings.includes(
      'DIRECT_DATABASE_URL must not use pgbouncer=true; use the direct Neon host for migrations'
    ),
    true
  );
  assert.equal(
    result.warnings.includes(
      'DIRECT_DATABASE_URL appears to use a pooler host; use the direct Neon host instead'
    ),
    true
  );
});

test('dashboard launch contract requires token encryption key', () => {
  const result = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({
      TOKEN_ENCRYPTION_KEY: '',
    }),
  });

  assert.equal(
    result.errors.includes('Missing required environment variable: TOKEN_ENCRYPTION_KEY'),
    true
  );
});

test('gateway launch contract validates optional Twilio webhook path when provided', () => {
  const result = validateProductionEnv('gateway', {
    scope: 'launch',
    env: createGatewayLaunchEnv({
      TWILIO_WEBHOOK_URL: 'https://gateway.example.com/hooks/twilio',
    }),
  });

  assert.equal(result.errors.includes('TWILIO_WEBHOOK_URL must point to /webhooks/twilio'), true);
});

test('gateway launch contract requires Blob storage for inbound attachments', () => {
  const result = validateProductionEnv('gateway', {
    scope: 'launch',
    env: createGatewayLaunchEnv({
      BLOB_READ_WRITE_TOKEN: '',
    }),
  });

  assert.equal(
    result.errors.includes('Missing required environment variable: BLOB_READ_WRITE_TOKEN'),
    true
  );
});

test('gateway launch contract requires token encryption key', () => {
  const result = validateProductionEnv('gateway', {
    scope: 'launch',
    env: createGatewayLaunchEnv({
      TOKEN_ENCRYPTION_KEY: '',
    }),
  });

  assert.equal(
    result.errors.includes('Missing required environment variable: TOKEN_ENCRYPTION_KEY'),
    true
  );
});

test('gateway launch contract requires Postmark inbound basic auth credentials', () => {
  const result = validateProductionEnv('gateway', {
    scope: 'launch',
    env: createGatewayLaunchEnv({
      POSTMARK_INBOUND_USERNAME: '',
      POSTMARK_INBOUND_PASSWORD: '',
    }),
  });

  assert.equal(
    result.errors.includes('Missing required environment variable: POSTMARK_INBOUND_USERNAME'),
    true
  );
  assert.equal(
    result.errors.includes('Missing required environment variable: POSTMARK_INBOUND_PASSWORD'),
    true
  );
});

test('Gmail Pub/Sub production settings use deployable identifiers', () => {
  const dashboard = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({
      GMAIL_PUBSUB_TOPIC: 'gmail-inbound',
    }),
  });
  const gateway = validateProductionEnv('gateway', {
    scope: 'launch',
    env: createGatewayLaunchEnv({
      GMAIL_NATIVE_INBOUND: 'gradual',
      GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT: 'not-an-email',
    }),
  });

  assert.equal(
    dashboard.errors.includes(
      'GMAIL_PUBSUB_TOPIC must use projects/<project>/topics/<topic>',
    ),
    true,
  );
  assert.equal(
    gateway.errors.includes(
      'GMAIL_NATIVE_INBOUND must be either true or false',
    ),
    true,
  );
  assert.equal(
    gateway.errors.includes(
      'GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT must be a Google service-account email',
    ),
    true,
  );
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

test('production contracts require an explicit product analytics setting', () => {
  const result = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({ PRODUCT_ANALYTICS_ENABLED: '' }),
  });

  assert.equal(
    result.errors.includes(
      'Missing required environment variable: PRODUCT_ANALYTICS_ENABLED',
    ),
    true
  );
});

test('production contracts require an explicit plan execution ledger rollout mode', () => {
  const dashboard = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({ PLAN_EXECUTION_LEDGER_MODE: '' }),
  });
  const gateway = validateProductionEnv('gateway', {
    scope: 'launch',
    env: createGatewayLaunchEnv({ PLAN_EXECUTION_LEDGER_MODE: 'enforced' }),
  });

  assert.equal(
    dashboard.errors.includes(
      'Missing required environment variable: PLAN_EXECUTION_LEDGER_MODE',
    ),
    true,
  );
  assert.equal(
    gateway.errors.includes(
      'PLAN_EXECUTION_LEDGER_MODE must be one of: off, shadow, enforce',
    ),
    true,
  );
});

test('production contracts require a valid AI context budget rollout mode', () => {
  const dashboard = validateProductionEnv('dashboard', {
    scope: 'launch',
    env: createDashboardLaunchEnv({ AGENT_CONTEXT_BUDGET_MODE: '' }),
  });
  const gateway = validateProductionEnv('gateway', {
    scope: 'launch',
    env: createGatewayLaunchEnv({ AGENT_CONTEXT_BUDGET_MODE: 'enabled' }),
  });

  assert.equal(
    dashboard.errors.includes(
      'Missing required environment variable: AGENT_CONTEXT_BUDGET_MODE',
    ),
    true,
  );
  assert.equal(
    gateway.errors.includes(
      'AGENT_CONTEXT_BUDGET_MODE must be one of: off, shadow, enforce',
    ),
    true,
  );
});

test('enabled product analytics requires a token and HTTPS host', () => {
  const result = validateProductionEnv('gateway', {
    scope: 'launch',
    env: createGatewayLaunchEnv({
      PRODUCT_ANALYTICS_ENABLED: 'true',
      POSTHOG_PROJECT_TOKEN: '',
      POSTHOG_HOST: 'http://us.i.posthog.com',
    }),
  });

  assert.equal(
    result.errors.includes(
      'POSTHOG_PROJECT_TOKEN is required when PRODUCT_ANALYTICS_ENABLED=true',
    ),
    true
  );
  assert.equal(
    result.errors.includes(
      'POSTHOG_HOST must use https when product analytics is enabled',
    ),
    true
  );
});

test('env file parser trims comments and quoted values the same way prod env files are written', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'shopkeeper-env-check-'));
  const envFile = join(tempDir, 'gateway.env');
  writeFileSync(
    envFile,
    [
      'DATABASE_URL="postgresql://prod.example/db?pgbouncer=true&connection_limit=1"',
      'DIRECT_DATABASE_URL=postgresql://prod.example/db',
      'REDIS_URL=rediss://redis.example.com:6379/0',
      'ANTHROPIC_API_KEY=test-anthropic-key',
      'INTERNAL_API_SECRET=test-internal-secret',
      'DASHBOARD_URL=https://app.example.com',
      'TOKEN_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000',
      'SHOPIFY_APP_SECRET=shopify-app-secret',
      'BLOB_READ_WRITE_TOKEN=vercel-blob-token   # attachment storage',
      'POSTMARK_INBOUND_USERNAME=postmark-inbound-user',
      'POSTMARK_INBOUND_PASSWORD=postmark-inbound-pass',
      'GOOGLE_CLIENT_ID=google-client-id',
      'GOOGLE_CLIENT_SECRET=google-client-secret',
      'GMAIL_NATIVE_INBOUND=false',
      'GMAIL_PUBSUB_TOPIC=projects/shopkeeper-prod/topics/gmail-inbound',
      'GMAIL_PUBSUB_AUDIENCE=https://gateway.example.com/webhooks/gmail/push',
      'GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT=shopkeeper-gmail-push@shopkeeper-prod.iam.gserviceaccount.com',
      'SPECTRUM_PROJECT_ID=project_1',
      'SPECTRUM_PROJECT_SECRET=project_secret_1',
      'SPECTRUM_WEBHOOK_SECRET=webhook_secret_1',
      'PRODUCT_ANALYTICS_ENABLED=false',
      'PLAN_EXECUTION_LEDGER_MODE=shadow',
      'AGENT_CONTEXT_BUDGET_MODE=shadow',
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
