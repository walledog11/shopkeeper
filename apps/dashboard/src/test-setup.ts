import { config } from 'dotenv';
import { vi } from 'vitest';

config({ path: '.env.local' });

// Seed env vars that routes check before calling mocked clients.
// Tests that explicitly test the missing-key 502 path delete the var themselves.
if (!process.env.POSTMARK_API_KEY) process.env.POSTMARK_API_KEY = 'test-postmark-key';

// Bypass rate limiting in tests — no Redis available in CI
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 100, reset: 9999999999 }),
  tooManyRequests: vi.fn(),
}));
