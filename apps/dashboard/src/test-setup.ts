import { installTestNetworkGuard, resetTestNetworkAllowlist } from '../../../scripts/test-network-guard.mjs';
import { getTestEnv } from '../../../scripts/with-test-env.mjs';
import { afterEach } from 'vitest';

const TEST_DEFAULT_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'CLERK_SECRET_KEY',
  'ANTHROPIC_API_KEY',
  'INTERNAL_API_SECRET',
  'INTERNAL_API_SECRET_PREV',
  'POSTMARK_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const;

type TestDefaultKey = (typeof TEST_DEFAULT_KEYS)[number];
type TestDefaultsEnv = NodeJS.ProcessEnv & Record<TestDefaultKey, string | undefined>;

const testEnv = getTestEnv(process.env) as TestDefaultsEnv;
for (const key of TEST_DEFAULT_KEYS) {
  const value = testEnv[key];
  if (!process.env[key] && value) process.env[key] = value;
}

if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'silent';
if (!process.env.LOG_PRETTY) process.env.LOG_PRETTY = 'false';
process.env.E2E_OUTBOUND_MODE = 'live';

installTestNetworkGuard();

afterEach(() => {
  resetTestNetworkAllowlist();
});
