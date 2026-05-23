import { installTestNetworkGuard, resetTestNetworkAllowlist } from '../../../scripts/test-network-guard.mjs';
import { getTestEnv } from '../../../scripts/with-test-env.mjs';
import { afterEach } from 'vitest';

// Fallback values for CI where no .env file exists.
// Values must match the ?? fallbacks in test files so HMAC signatures align.
const TEST_DEFAULT_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'META_APP_SECRET',
  'META_VERIFY_TOKEN',
  'INTERNAL_API_SECRET',
  'INTERNAL_API_SECRET_PREV',
  'ANTHROPIC_API_KEY',
  'DASHBOARD_URL',
  'DASHBOARD_INTERNAL_URL',
  'SHOPIFY_APP_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
] as const;

type TestDefaultKey = (typeof TEST_DEFAULT_KEYS)[number];
type TestDefaultsEnv = NodeJS.ProcessEnv & Record<TestDefaultKey, string | undefined>;

const testEnv = {
  ...getTestEnv(process.env),
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token',
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || 'test-telegram-webhook-secret',
} as TestDefaultsEnv;
for (const key of TEST_DEFAULT_KEYS) {
  const value = testEnv[key];
  if (!process.env[key] && value) process.env[key] = value;
}

if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'silent';
if (!process.env.LOG_PRETTY) process.env.LOG_PRETTY = 'false';

installTestNetworkGuard();

afterEach(() => {
  resetTestNetworkAllowlist();
});
