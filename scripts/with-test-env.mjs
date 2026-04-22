import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/clerk_test?schema=public';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379/0';

export function getTestEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    NODE_ENV: 'test',
    DATABASE_URL: baseEnv.TEST_DATABASE_URL || DEFAULT_DATABASE_URL,
    REDIS_URL: baseEnv.TEST_REDIS_URL || DEFAULT_REDIS_URL,
    NEON_SERVERLESS_HTTP: 'false',
    APP_URL: baseEnv.APP_URL || 'http://localhost:3000',
    DASHBOARD_URL: baseEnv.DASHBOARD_URL || 'http://localhost:3000',
    DASHBOARD_INTERNAL_URL: baseEnv.DASHBOARD_INTERNAL_URL || 'http://localhost:3000',
    GATEWAY_INTERNAL_URL: baseEnv.GATEWAY_INTERNAL_URL || 'http://localhost:8080',
    GATEWAY_PUBLIC_URL: baseEnv.GATEWAY_PUBLIC_URL || baseEnv.GATEWAY_INTERNAL_URL || 'http://localhost:8080',
    CLERK_SECRET_KEY: baseEnv.CLERK_SECRET_KEY || 'sk_test_clerk',
    OPENAI_API_KEY: baseEnv.OPENAI_API_KEY || 'sk-test-openai',
    ANTHROPIC_API_KEY: baseEnv.ANTHROPIC_API_KEY || 'test-anthropic-key',
    INTERNAL_API_SECRET: baseEnv.INTERNAL_API_SECRET || 'test-internal-secret',
    INTERNAL_API_SECRET_PREV: baseEnv.INTERNAL_API_SECRET_PREV || 'test-internal-secret-prev',
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
    TWILIO_WEBHOOK_URL: baseEnv.TWILIO_WEBHOOK_URL || 'http://localhost:8080/webhooks/twilio',
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
