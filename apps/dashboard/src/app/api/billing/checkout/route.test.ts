import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

const {
  mockCheckoutCreate,
  mockGetOrCreateStripeCustomer,
  mockRateLimit,
} = vi.hoisted(() => {
  process.env.PRICE_ID_STARTER = 'price_starter_test';
  process.env.PRICE_ID_PRO = 'price_pro_test';
  process.env.APP_URL = 'http://dashboard.test';

  return {
    mockCheckoutCreate: vi.fn(),
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
    checkout: {
      sessions: {
        create: mockCheckoutCreate,
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
  mockGetOrCreateStripeCustomer.mockResolvedValue('cus_checkout');
  mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
});

describe('POST /api/billing/checkout', () => {
  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      userId: null,
      orgId: null,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    const res = await POST(jsonReq({ tier: 'starter' }));

    expect(res.status).toBe(401);
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it('returns 429 when checkout session creation is rate limited', async () => {
    mockRateLimit.mockResolvedValueOnce({ success: false, remaining: 0, reset: 4321 });

    const res = await POST(jsonReq({ tier: 'starter' }));

    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Reset')).toBe('4321');
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it('creates a subscription checkout session using the server-side tier price', async () => {
    const res = await POST(jsonReq({ tier: 'starter', price: 'price_attacker_controlled' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.test/session' });
    expect(mockGetOrCreateStripeCustomer).toHaveBeenCalledWith(expect.objectContaining({ id: org!.id }));
    expect(mockCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_checkout',
      mode: 'subscription',
      line_items: [{ price: 'price_starter_test', quantity: 1 }],
      success_url: 'http://dashboard.test/dashboard',
      cancel_url: 'http://dashboard.test/dashboard',
    }));
  });

  it('rejects unknown tiers before creating a Stripe customer', async () => {
    const res = await POST(jsonReq({ tier: 'enterprise' }));

    expect(res.status).toBe(400);
    expect(mockGetOrCreateStripeCustomer).not.toHaveBeenCalled();
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON before creating a Stripe customer', async () => {
    const res = await POST(rawReq('{'));

    expect(res.status).toBe(400);
    expect(mockGetOrCreateStripeCustomer).not.toHaveBeenCalled();
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });
});

function jsonReq(body: unknown) {
  return new Request('http://localhost/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawReq(body: string) {
  return new Request('http://localhost/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
