import { installTestNetworkGuard, resetTestNetworkAllowlist } from '../../../scripts/test-network-guard.mjs';
import { getTestEnv } from '../../../scripts/with-test-env.mjs';
import { afterEach, beforeEach, vi } from 'vitest';

const TEST_DEFAULT_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'CLERK_SECRET_KEY',
  'ANTHROPIC_API_KEY',
  'INTERNAL_API_SECRET',
  'INTERNAL_API_SECRET_PREV',
  'OAUTH_ATTEMPT_SECRET',
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
// The limiter fails closed without Upstash env, which 429s every rate-limited
// route test. Set explicitly to opt back into enforcement.
if (!process.env.E2E_TEST_RUN) process.env.E2E_TEST_RUN = 'true';
process.env.E2E_OUTBOUND_MODE = 'live';

installTestNetworkGuard();

const membershipDefaults = new WeakSet<object>();

beforeEach(async () => {
  const clerk = await import('@clerk/nextjs/server');
  if (!Object.hasOwn(clerk, 'clerkClient')) return;
  const { clerkClient } = clerk;
  if (!vi.isMockFunction(clerkClient)) return;
  const original = clerkClient.getMockImplementation();
  if (original && membershipDefaults.has(original)) return;

  // Existing route fixtures represent an active Clerk session. Supply its
  // membership response when their SDK stub predates member provisioning;
  // explicit membership responses and failures remain authoritative.
  const withMembership = async (...args: Parameters<typeof clerkClient>) => {
    const client = await original?.(...args);
    if (client?.organizations?.getOrganizationMembershipList) return client;
    return {
      ...client,
      organizations: {
        ...client?.organizations,
        getOrganizationMembershipList: async ({ userId = [] }: { userId?: string[] }) => ({
          data: userId.map(id => ({ publicUserData: { userId: id } })),
          totalCount: userId.length,
        }),
      },
    };
  };
  membershipDefaults.add(withMembership);
  clerkClient.mockImplementation(withMembership);
});

afterEach(() => {
  resetTestNetworkAllowlist();
});
