import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

const {
  mockPortalCreate,
  mockGetOrCreateStripeCustomer,
  mockRateLimit,
} = vi.hoisted(() => {
  process.env.APP_URL = 'http://dashboard.test';

  return {
    mockPortalCreate: vi.fn(),
    mockGetOrCreateStripeCustomer: vi.fn(),
    mockRateLimit: vi.fn(),
  };
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/billing/stripe', () => ({
  default: {
    billingPortal: {
      sessions: {
        create: mockPortalCreate,
      },
    },
  },
}));

vi.mock('@/lib/billing/stripe-customer', () => ({
  getOrCreateStripeCustomer: mockGetOrCreateStripeCustomer,
}));

vi.mock('@/lib/server/rate-limit', () => ({
  rateLimit: mockRateLimit,
  tooManyRequests: (reset: number) => Response.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'X-RateLimit-Reset': String(reset) } },
  ),
}));

import { POST } from './route';
import { auth } from '@clerk/nextjs/server';

let org: Awaited<ReturnType<typeof createTestOrg>> | null;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_billing',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockRateLimit.mockResolvedValue({ success: true, remaining: 4, reset: 1234 });
  mockGetOrCreateStripeCustomer.mockResolvedValue('cus_portal');
  mockPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.test/session' });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
});

describe('POST /api/billing/portal', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      userId: null,
      orgId: null,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it('returns 429 when billing portal creation is rate limited', async () => {
    mockRateLimit.mockResolvedValueOnce({ success: false, remaining: 0, reset: 4321 });

    const res = await POST();

    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Reset')).toBe('4321');
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it('creates a portal session for the active org customer', async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://billing.stripe.test/session' });
    expect(mockGetOrCreateStripeCustomer).toHaveBeenCalledWith(expect.objectContaining({ id: org!.id }));
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: 'cus_portal',
      return_url: 'http://dashboard.test/dashboard/settings?tab=billing',
    });
  });

  it('rejects non-empty request bodies', async () => {
    const res = await POST(new Request('http://localhost/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extra: true }),
    }));

    expect(res.status).toBe(400);
    expect(mockGetOrCreateStripeCustomer).not.toHaveBeenCalled();
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });
});
