import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

const {
  mockAuth,
  mockGetOrCreateStripeCustomer,
  mockSubscriptionsRetrieve,
  mockSubscriptionsList,
  mockProductsRetrieve,
  mockPaymentMethodsList,
  mockInvoicesCreatePreview,
  mockInvoicesList,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetOrCreateStripeCustomer: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  mockSubscriptionsList: vi.fn(),
  mockProductsRetrieve: vi.fn(),
  mockPaymentMethodsList: vi.fn(),
  mockInvoicesCreatePreview: vi.fn(),
  mockInvoicesList: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/billing/stripe', () => ({
  default: {
    subscriptions: { retrieve: mockSubscriptionsRetrieve, list: mockSubscriptionsList },
    products: { retrieve: mockProductsRetrieve },
    paymentMethods: { list: mockPaymentMethodsList },
    invoices: { createPreview: mockInvoicesCreatePreview, list: mockInvoicesList },
  },
}));

vi.mock('@/lib/billing/stripe-customer', () => ({
  getOrCreateStripeCustomer: mockGetOrCreateStripeCustomer,
}));

vi.mock('@/lib/server/logger', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';

type BillingBody = {
  status: string;
  planName: string | null;
  priceId: string | null;
  amount: number | null;
  interval: string | null;
  trialEnd: number | null;
  nextInvoice: { date: number; amount: number } | null;
  paymentMethod: { brand: string; last4: string } | null;
  invoices: { id: string; date: number; amount: number; status: string; pdfUrl: string }[];
};

const subscription = (overrides: Record<string, unknown> = {}) => ({
  status: 'active',
  trial_end: null,
  default_payment_method: null,
  items: {
    data: [{
      price: {
        id: 'price_starter',
        unit_amount: 1900,
        recurring: { interval: 'month' },
        product: 'prod_starter',
      },
    }],
  },
  ...overrides,
});

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(async () => {
  org = await createTestOrg();
  mockAuth.mockResolvedValue({ userId: 'usr_billing', orgId: org.clerkOrgId });
  mockGetOrCreateStripeCustomer.mockResolvedValue('cus_caller');
  mockSubscriptionsList.mockResolvedValue({ data: [] });
  mockProductsRetrieve.mockResolvedValue({ name: 'Starter' });
  mockPaymentMethodsList.mockResolvedValue({ data: [] });
  mockInvoicesCreatePreview.mockResolvedValue({ next_payment_attempt: 111, period_end: 222, amount_due: 1900 });
  mockInvoicesList.mockResolvedValue({ data: [] });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
});

describe('GET /api/billing', () => {
  it('reports status "none" for an org with no subscription anywhere', async () => {
    const response = await GET();
    const body = (await response.json()) as BillingBody;

    expect(response.status).toBe(200);
    expect(body.status).toBe('none');
    expect(body.planName).toBeNull();
    expect(body.priceId).toBeNull();
    expect(body.nextInvoice).toBeNull();
  });

  it('reads the subscription recorded on the org when there is one', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: { stripeSubscriptionId: 'sub_recorded' },
    });
    mockSubscriptionsRetrieve.mockResolvedValue(subscription());

    const response = await GET();
    const body = (await response.json()) as BillingBody;

    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_recorded', expect.anything());
    // Listing by customer is the fallback; using it when an id is on file could
    // surface a different (e.g. older, canceled) subscription than the one billed.
    expect(mockSubscriptionsList).not.toHaveBeenCalled();
    expect(body.status).toBe('active');
    expect(body.priceId).toBe('price_starter');
    expect(body.amount).toBe(1900);
    expect(body.interval).toBe('month');
    expect(body.planName).toBe('Starter');
  });

  it('falls back to listing by Stripe customer when the org has no subscription id', async () => {
    mockSubscriptionsList.mockResolvedValue({ data: [subscription()] });

    const response = await GET();
    const body = (await response.json()) as BillingBody;

    expect(mockSubscriptionsList).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_caller' }),
    );
    expect(body.status).toBe('active');
  });

  it("scopes every Stripe read to the caller's own customer id", async () => {
    mockSubscriptionsList.mockResolvedValue({ data: [subscription()] });

    await GET();

    // Billing is the most damaging surface to cross tenants on. Every call that
    // takes a customer must take this org's, not one derived from user input.
    for (const call of mockSubscriptionsList.mock.calls) {
      expect(call[0]).toMatchObject({ customer: 'cus_caller' });
    }
    for (const call of mockInvoicesList.mock.calls) {
      expect(call[0]).toMatchObject({ customer: 'cus_caller' });
    }
    expect(mockGetOrCreateStripeCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ id: org!.id }),
    );
  });

  it('prefers the card attached to the subscription over the account default', async () => {
    mockSubscriptionsList.mockResolvedValue({
      data: [subscription({
        default_payment_method: { card: { brand: 'visa', last4: '4242' } },
      })],
    });
    mockPaymentMethodsList.mockResolvedValue({
      data: [{ card: { brand: 'amex', last4: '0005' } }],
    });

    const body = (await (await GET()).json()) as BillingBody;

    expect(body.paymentMethod).toEqual({ brand: 'visa', last4: '4242' });
    // The subscription's own card is the one that will actually be charged.
    expect(mockPaymentMethodsList).not.toHaveBeenCalled();
  });

  it('falls back to the customer card when the subscription has none attached', async () => {
    mockSubscriptionsList.mockResolvedValue({ data: [subscription()] });
    mockPaymentMethodsList.mockResolvedValue({
      data: [{ card: { brand: 'amex', last4: '0005' } }],
    });

    const body = (await (await GET()).json()) as BillingBody;

    expect(body.paymentMethod).toEqual({ brand: 'amex', last4: '0005' });
  });

  it('omits the upcoming invoice for a canceled subscription', async () => {
    mockSubscriptionsList.mockResolvedValue({ data: [subscription({ status: 'canceled' })] });

    const body = (await (await GET()).json()) as BillingBody;

    expect(body.status).toBe('canceled');
    // Showing a next charge to someone who has cancelled is the kind of billing
    // surprise that generates a support ticket.
    expect(body.nextInvoice).toBeNull();
    expect(mockInvoicesCreatePreview).not.toHaveBeenCalled();
  });

  it('survives Stripe having no upcoming invoice to preview', async () => {
    mockSubscriptionsList.mockResolvedValue({ data: [subscription()] });
    mockInvoicesCreatePreview.mockRejectedValue(new Error('no upcoming invoice'));

    const response = await GET();
    const body = (await response.json()) as BillingBody;

    // The preview is best-effort; its absence must not fail the whole page.
    expect(response.status).toBe(200);
    expect(body.nextInvoice).toBeNull();
    expect(body.status).toBe('active');
  });

  it('prefers the scheduled payment date over the period end', async () => {
    mockSubscriptionsList.mockResolvedValue({ data: [subscription()] });

    const body = (await (await GET()).json()) as BillingBody;

    expect(body.nextInvoice).toEqual({ date: 111, amount: 1900 });
  });

  it('falls back to the period end when no payment attempt is scheduled', async () => {
    mockSubscriptionsList.mockResolvedValue({ data: [subscription()] });
    mockInvoicesCreatePreview.mockResolvedValue({
      next_payment_attempt: null,
      period_end: 222,
      amount_due: 1900,
    });

    const body = (await (await GET()).json()) as BillingBody;

    expect(body.nextInvoice).toEqual({ date: 222, amount: 1900 });
  });

  it('returns invoice history as amount paid, not amount billed', async () => {
    mockInvoicesList.mockResolvedValue({
      data: [{
        id: 'in_1',
        created: 1700,
        amount_paid: 1900,
        amount_due: 9900,
        status: 'paid',
        invoice_pdf: 'https://stripe.test/in_1.pdf',
      }],
    });

    const body = (await (await GET()).json()) as BillingBody;

    expect(body.invoices).toEqual([{
      id: 'in_1',
      date: 1700,
      amount: 1900,
      status: 'paid',
      pdfUrl: 'https://stripe.test/in_1.pdf',
    }]);
  });

  it('resolves the plan name when the price expands the product inline', async () => {
    mockSubscriptionsList.mockResolvedValue({
      data: [subscription({
        items: {
          data: [{
            price: {
              id: 'price_pro',
              unit_amount: 4900,
              recurring: { interval: 'month' },
              product: { id: 'prod_pro', name: 'ignored' },
            },
          }],
        },
      })],
    });
    mockProductsRetrieve.mockResolvedValue({ name: 'Pro' });

    const body = (await (await GET()).json()) as BillingBody;

    expect(mockProductsRetrieve).toHaveBeenCalledWith('prod_pro');
    expect(body.planName).toBe('Pro');
  });

  it('does not leak Stripe error text when the API fails', async () => {
    mockSubscriptionsList.mockRejectedValue(new Error('No such customer: cus_secret_internal'));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('cus_secret_internal');
  });
});
