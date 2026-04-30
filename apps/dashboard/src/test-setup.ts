import { vi } from 'vitest';

const TEST_DEFAULTS: Record<string, string> = {
  CLERK_SECRET_KEY: 'sk_test_clerk',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  INTERNAL_API_SECRET: 'test-internal-secret',
  POSTMARK_API_KEY: 'test-postmark-key',
  STRIPE_SECRET_KEY: 'sk_test_stripe',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_stripe',
};

for (const [key, value] of Object.entries(TEST_DEFAULTS)) {
  if (!process.env[key]) process.env[key] = value;
}

process.env.E2E_OUTBOUND_MODE = 'live';

// Bypass rate limiting in tests — no Redis available in CI
vi.mock('@/lib/server/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 100, reset: 9999999999 }),
  tooManyRequests: vi.fn(),
}));
