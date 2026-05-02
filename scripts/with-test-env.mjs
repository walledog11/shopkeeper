import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55432/clerk_test?schema=public';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:56379/0';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function getTestEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    NODE_ENV: 'test',
    DATABASE_URL: baseEnv.TEST_DATABASE_URL || DEFAULT_DATABASE_URL,
    REDIS_URL: baseEnv.TEST_REDIS_URL || DEFAULT_REDIS_URL,
    NEON_SERVERLESS_HTTP: 'false',
    APP_URL: baseEnv.APP_URL || 'http://127.0.0.1:3100',
    DASHBOARD_URL: baseEnv.DASHBOARD_URL || 'http://127.0.0.1:3100',
    DASHBOARD_INTERNAL_URL: baseEnv.DASHBOARD_INTERNAL_URL || 'http://127.0.0.1:3100',
    GATEWAY_INTERNAL_URL: baseEnv.GATEWAY_INTERNAL_URL || 'http://127.0.0.1:8180',
    GATEWAY_PUBLIC_URL: baseEnv.GATEWAY_PUBLIC_URL || baseEnv.GATEWAY_INTERNAL_URL || 'http://127.0.0.1:8180',
    PORT: baseEnv.PORT || '8180',
    E2E_TEST_RUN: baseEnv.E2E_TEST_RUN || 'true',
    CLERK_SECRET_KEY: baseEnv.CLERK_SECRET_KEY || 'sk_test_clerk',
    CLERK_PUBLISHABLE_KEY: baseEnv.CLERK_PUBLISHABLE_KEY || baseEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k', // gitleaks:allow
    ANTHROPIC_API_KEY: baseEnv.ANTHROPIC_API_KEY || 'test-anthropic-key',
    INTERNAL_API_SECRET: baseEnv.INTERNAL_API_SECRET || 'test-internal-secret',
    INTERNAL_API_SECRET_PREV: baseEnv.INTERNAL_API_SECRET_PREV || 'test-internal-secret-prev',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: baseEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || baseEnv.CLERK_PUBLISHABLE_KEY || 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k', // gitleaks:allow
    E2E_AUTH_BYPASS: baseEnv.E2E_AUTH_BYPASS || 'false',
    E2E_AI_MODE: baseEnv.E2E_AI_MODE || 'deterministic',
    E2E_CLERK_ORG_ID: baseEnv.E2E_CLERK_ORG_ID || 'org_e2e_test',
    E2E_CLERK_USER_ID: baseEnv.E2E_CLERK_USER_ID || 'user_e2e_test',
    E2E_OUTBOUND_MODE: baseEnv.E2E_OUTBOUND_MODE || 'record',
    E2E_OUTBOUND_RECORD_PATH: baseEnv.E2E_OUTBOUND_RECORD_PATH || path.join(REPO_ROOT, 'test-results', 'e2e-outbound.jsonl'),
    E2E_TEST_EMAIL_ADDRESS: baseEnv.E2E_TEST_EMAIL_ADDRESS || 'support-e2e@inbound.test',
    E2E_TEST_ORG_NAME: baseEnv.E2E_TEST_ORG_NAME || 'E2E Test Store',
    META_APP_ID: baseEnv.META_APP_ID || 'test-meta-app-id',
    META_APP_SECRET: baseEnv.META_APP_SECRET || 'test-meta-secret',
    META_VERIFY_TOKEN: baseEnv.META_VERIFY_TOKEN || 'test-verify-token',
    POSTMARK_API_KEY: baseEnv.POSTMARK_API_KEY || 'test-postmark-key',
    SHOPIFY_APP_SECRET: baseEnv.SHOPIFY_APP_SECRET || 'test-shopify-secret',
    STRIPE_SECRET_KEY: baseEnv.STRIPE_SECRET_KEY || 'sk_test_stripe',
    STRIPE_WEBHOOK_SECRET: baseEnv.STRIPE_WEBHOOK_SECRET || 'whsec_test_stripe',
    TWILIO_ACCOUNT_SID: baseEnv.TWILIO_ACCOUNT_SID || 'ACtest',
    TWILIO_AUTH_TOKEN: baseEnv.TWILIO_AUTH_TOKEN || 'test-twilio-token',
    TWILIO_FROM_NUMBER: baseEnv.TWILIO_FROM_NUMBER || '+15555550123',
    TWILIO_WHATSAPP_NUMBER: baseEnv.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+15555550123',
    TWILIO_WEBHOOK_URL: baseEnv.TWILIO_WEBHOOK_URL || 'http://127.0.0.1:8180/webhooks/twilio',
    UPSTASH_REDIS_REST_URL: baseEnv.UPSTASH_REDIS_REST_URL || 'https://example-upstash.local',
    UPSTASH_REDIS_REST_TOKEN: baseEnv.UPSTASH_REDIS_REST_TOKEN || 'test-upstash-token',
  };
}

async function main() {
  const command = process.argv.slice(2);
  if (command.length === 0) {
    console.error('[with-test-env] Missing command to execute');
    process.exit(1);
  }

  const child = spawn(command[0], command.slice(1), {
    stdio: 'inherit',
    env: getTestEnv(process.env),
  });

  child.on('error', (error) => {
    console.error('[with-test-env] Failed to start command', error);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
