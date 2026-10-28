import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  installProductAnalytics,
  NoopAnalyticsSink,
  RecordingAnalyticsSink,
} from '@shopkeeper/analytics';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import type Stripe from 'stripe';

const { mockConstructEvent } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
}));

vi.mock('@/lib/billing/stripe', () => ({
  default: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  },
}));

import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null;
let stripeCustomerId: string;
let analyticsSink: RecordingAnalyticsSink;

beforeEach(async () => {
  org = await createTestOrg();
  stripeCustomerId = `cus_${org.id.slice(0, 8)}`;
  await db.organization.update({
    where: { id: org.id },
    data: { stripeCustomerId },
  });
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_stripe');
  vi.stubEnv('PRICE_ID_PRO', 'price_pro');
  vi.stubEnv('PRICE_ID_STARTER', 'price_starter');
  analyticsSink = new RecordingAnalyticsSink();
  installProductAnalytics({ sink: analyticsSink, environment: 'test' });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  installProductAnalytics({ sink: new NoopAnalyticsSink(), environment: 'test' });
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('POST /api/billing/webhook', () => {
  it('rejects a missing Stripe signature before mutating billing state', async () => {
    const res = await POST(new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_missing' }),
    }));

    expect(res.status).toBe(400);
    expect(mockConstructEvent).not.toHaveBeenCalled();

    const unchanged = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(unchanged.stripeStatus).toBeNull();
  });

  it('rejects invalid Stripe webhook signatures', async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error('bad signature');
    });

    const res = await POST(signedRequest('{}'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('updates subscription fields from subscription events', async () => {
    mockConstructEvent.mockReturnValueOnce(stripeEvent('evt_sub_updated', 'customer.subscription.updated', {
      id: 'sub_123',
      customer: stripeCustomerId,
      status: 'active',
      items: { data: [{ price: { id: 'price_pro' } }] },
      trial_end: 1_800_000_000,
    }));

    const res = await POST(signedRequest('{}'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const updated = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(updated.stripeSubscriptionId).toBe('sub_123');
    expect(updated.stripeStatus).toBe('active');
    expect(updated.stripePriceId).toBe('price_pro');
    expect(updated.trialEndsAt?.toISOString()).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(updated.stripeStateEventId).toBe('evt_sub_updated');
    await expect(db.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: 'evt_sub_updated' },
    })).resolves.toMatchObject({
      status: 'completed',
      attempts: 1,
      organizationId: org!.id,
    });
    expect(analyticsSink.events).toEqual([
      expect.objectContaining({
        event: 'subscription_status_changed',
        distinctId: org!.id,
        properties: expect.objectContaining({
          previous_status: 'none',
          new_status: 'active',
          plan: 'pro',
          '$insert_id': 'subscription_status_changed:evt_sub_updated',
        }),
      }),
    ]);
  });

  it('dedupes a durably completed Stripe event without applying it twice', async () => {
    const event = stripeEvent('evt_duplicate', 'customer.subscription.updated', {
      id: 'sub_once',
      customer: stripeCustomerId,
      status: 'active',
      items: { data: [{ price: { id: 'price_pro' } }] },
      trial_end: null,
    });
    mockConstructEvent.mockReturnValue(event);

    const first = await POST(signedRequest('{}'));
    const second = await POST(signedRequest('{}'));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });

    const updated = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(updated.stripeSubscriptionId).toBe('sub_once');
    expect(updated.stripeStatus).toBe('active');
    expect(updated.stripePriceId).toBe('price_pro');
    expect(analyticsSink.events).toHaveLength(1);
    await expect(db.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: 'evt_duplicate' },
    })).resolves.toMatchObject({ status: 'completed', attempts: 1 });
  });

  it('commits billing state even when analytics delivery fails', async () => {
    installProductAnalytics({
      environment: 'test',
      sink: {
        capture: vi.fn(async () => {
          throw new Error('analytics unavailable');
        }),
      },
    });
    mockConstructEvent.mockReturnValueOnce(stripeEvent('evt_analytics_outage', 'customer.subscription.updated', {
      id: 'sub_analytics_outage',
      customer: stripeCustomerId,
      status: 'active',
      items: { data: [{ price: { id: 'price_pro' } }] },
      trial_end: null,
    }));

    const response = await POST(signedRequest('{}'));

    expect(response.status).toBe(200);
    const updated = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(updated.stripeSubscriptionId).toBe('sub_analytics_outage');
    await expect(db.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: 'evt_analytics_outage' },
    })).resolves.toMatchObject({ status: 'completed', attempts: 1 });
  });

  it('admits one concurrent processor for the same event', async () => {
    const event = stripeEvent('evt_concurrent', 'customer.subscription.updated', {
      id: 'sub_concurrent',
      customer: stripeCustomerId,
      status: 'active',
      items: { data: [{ price: { id: 'price_pro' } }] },
      trial_end: null,
    });
    mockConstructEvent.mockReturnValue(event);

    const responses = await Promise.all([
      POST(signedRequest('{}')),
      POST(signedRequest('{}')),
    ]);

    expect(responses.some(response => response.status === 200)).toBe(true);
    expect(responses.every(response => response.status === 200 || response.status === 503)).toBe(true);
    expect(analyticsSink.events).toHaveLength(1);
    await expect(db.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: 'evt_concurrent' },
    })).resolves.toMatchObject({ status: 'completed', attempts: 1 });
  });

  it('returns a retryable response while another durable claim is active', async () => {
    const event = stripeEvent('evt_processing', 'customer.subscription.updated', {
      id: 'sub_processing',
      customer: stripeCustomerId,
      status: 'active',
      items: { data: [{ price: { id: 'price_pro' } }] },
      trial_end: null,
    });
    await db.stripeWebhookEvent.create({
      data: {
        id: event.id,
        type: event.type,
        stripeCreatedAt: new Date(event.created * 1000),
        customerId: stripeCustomerId,
        subscriptionId: 'sub_processing',
        organizationId: org!.id,
        status: 'processing',
        claimToken: '11111111-1111-4111-8111-111111111111',
        claimedAt: new Date(),
        attempts: 1,
      },
    });
    mockConstructEvent.mockReturnValueOnce(event);

    const response = await POST(signedRequest('{}'));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ received: false, retry: true });
    await expect(db.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } }))
      .resolves.toMatchObject({ status: 'processing', attempts: 1 });
  });

  it('reclaims a stale processing event and completes it once', async () => {
    const event = stripeEvent('evt_stale_claim', 'customer.subscription.updated', {
      id: 'sub_stale_claim',
      customer: stripeCustomerId,
      status: 'active',
      items: { data: [{ price: { id: 'price_pro' } }] },
      trial_end: null,
    });
    await db.stripeWebhookEvent.create({
      data: {
        id: event.id,
        type: event.type,
        stripeCreatedAt: new Date(event.created * 1000),
        customerId: stripeCustomerId,
        subscriptionId: 'sub_stale_claim',
        organizationId: org!.id,
        status: 'processing',
        claimToken: '22222222-2222-4222-8222-222222222222',
        claimedAt: new Date(Date.now() - 6 * 60 * 1000),
        attempts: 1,
      },
    });
    mockConstructEvent.mockReturnValueOnce(event);

    const response = await POST(signedRequest('{}'));

    expect(response.status).toBe(200);
    await expect(db.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } }))
      .resolves.toMatchObject({ status: 'completed', attempts: 2 });
    const updated = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(updated.stripeSubscriptionId).toBe('sub_stale_claim');
  });

  it('marks subscriptions canceled on delete events', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: {
        stripeSubscriptionId: 'sub_delete',
        stripeStatus: 'active',
        stripePriceId: 'price_starter',
        trialEndsAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    mockConstructEvent.mockReturnValueOnce(stripeEvent('evt_sub_deleted', 'customer.subscription.deleted', {
      id: 'sub_delete',
      customer: stripeCustomerId,
      status: 'canceled',
      items: { data: [] },
      trial_end: null,
    }));

    const res = await POST(signedRequest('{}'));

    expect(res.status).toBe(200);
    const updated = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(updated.stripeSubscriptionId).toBeNull();
    expect(updated.stripeStatus).toBe('canceled');
    expect(updated.stripePriceId).toBeNull();
    expect(updated.trialEndsAt).toBeNull();
  });

  it('marks the org past_due on invoice.payment_failed', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: { stripeStatus: 'active', stripeSubscriptionId: 'sub_active', stripePriceId: 'price_pro' },
    });
    mockConstructEvent.mockReturnValueOnce(stripeEvent('evt_payment_failed', 'invoice.payment_failed', {
      id: 'in_failed',
      customer: stripeCustomerId,
      parent: { subscription_details: { subscription: 'sub_active' } },
    }));

    const res = await POST(signedRequest('{}'));

    expect(res.status).toBe(200);
    const updated = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(updated.stripeStatus).toBe('past_due');
    expect(updated.stripeSubscriptionId).toBe('sub_active');
    expect(updated.stripePriceId).toBe('price_pro');
  });

  it('does not override a canceled status on invoice.payment_failed', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: { stripeStatus: 'canceled' },
    });
    mockConstructEvent.mockReturnValueOnce(stripeEvent('evt_payment_failed_canceled', 'invoice.payment_failed', {
      id: 'in_failed_canceled',
      customer: stripeCustomerId,
      parent: { subscription_details: { subscription: 'sub_canceled' } },
    }));

    const res = await POST(signedRequest('{}'));

    expect(res.status).toBe(200);
    const unchanged = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(unchanged.stripeStatus).toBe('canceled');
  });

  it('does not mark a subscription past_due for a one-off failed invoice', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: { stripeStatus: 'active', stripeSubscriptionId: 'sub_active', stripePriceId: 'price_pro' },
    });
    mockConstructEvent.mockReturnValueOnce(stripeEvent('evt_one_off_failed', 'invoice.payment_failed', {
      id: 'in_one_off_failed',
      customer: stripeCustomerId,
    }));

    const response = await POST(signedRequest('{}'));

    expect(await response.json()).toEqual({ received: true, stale: true });
    const unchanged = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(unchanged.stripeStatus).toBe('active');
    expect(unchanged.stripeStateEventId).toBeNull();
  });

  it('does not apply a failed invoice from a different subscription', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: { stripeStatus: 'active', stripeSubscriptionId: 'sub_current', stripePriceId: 'price_pro' },
    });
    mockConstructEvent.mockReturnValueOnce(stripeEvent('evt_other_invoice_failed', 'invoice.payment_failed', {
      id: 'in_other_failed',
      customer: stripeCustomerId,
      parent: { subscription_details: { subscription: 'sub_other' } },
    }));

    const response = await POST(signedRequest('{}'));

    expect(await response.json()).toEqual({ received: true, stale: true });
    const unchanged = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(unchanged.stripeStatus).toBe('active');
    expect(unchanged.stripeSubscriptionId).toBe('sub_current');
  });

  it('records a failed attempt and retries the same durable event', async () => {
    const invalid = stripeEvent('evt_retry', 'customer.subscription.updated', {
      id: 'sub_retry',
      customer: stripeCustomerId,
      status: 'x'.repeat(60),
      items: { data: [{ price: { id: 'price_pro' } }] },
      trial_end: null,
    });
    mockConstructEvent.mockReturnValueOnce(invalid);

    const failed = await POST(signedRequest('{}'));

    expect(failed.status).toBe(500);
    await expect(db.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: 'evt_retry' },
    })).resolves.toMatchObject({ status: 'failed', attempts: 1 });

    mockConstructEvent.mockReturnValueOnce(stripeEvent('evt_retry', 'customer.subscription.updated', {
      id: 'sub_retry',
      customer: stripeCustomerId,
      status: 'active',
      items: { data: [{ price: { id: 'price_pro' } }] },
      trial_end: null,
    }));

    const retried = await POST(signedRequest('{}'));

    expect(retried.status).toBe(200);
    await expect(db.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: 'evt_retry' },
    })).resolves.toMatchObject({ status: 'completed', attempts: 2, lastError: null });
    const updated = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(updated.stripeStatus).toBe('active');
  });

  it('completes an out-of-order event without overwriting newer billing state', async () => {
    mockConstructEvent
      .mockReturnValueOnce(stripeEvent('evt_newer', 'customer.subscription.updated', {
        id: 'sub_ordered',
        customer: stripeCustomerId,
        status: 'active',
        items: { data: [{ price: { id: 'price_pro' } }] },
        trial_end: null,
      }, 300))
      .mockReturnValueOnce(stripeEvent('evt_older', 'customer.subscription.deleted', {
        id: 'sub_ordered',
        customer: stripeCustomerId,
        status: 'canceled',
        items: { data: [] },
        trial_end: null,
      }, 200));

    const newer = await POST(signedRequest('{}'));
    const older = await POST(signedRequest('{}'));

    expect(newer.status).toBe(200);
    expect(await older.json()).toEqual({ received: true, stale: true });
    const unchanged = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(unchanged.stripeSubscriptionId).toBe('sub_ordered');
    expect(unchanged.stripeStatus).toBe('active');
    expect(unchanged.stripeStateEventId).toBe('evt_newer');
    await expect(db.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: 'evt_older' },
    })).resolves.toMatchObject({ status: 'completed', attempts: 1 });
  });

  it('does not let a different subscription delete the current subscription', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: {
        stripeSubscriptionId: 'sub_current',
        stripeStatus: 'active',
        stripePriceId: 'price_pro',
      },
    });
    mockConstructEvent.mockReturnValueOnce(stripeEvent(
      'evt_old_subscription_deleted',
      'customer.subscription.deleted',
      {
        id: 'sub_old',
        customer: stripeCustomerId,
        status: 'canceled',
        items: { data: [] },
        trial_end: null,
      },
      400,
    ));

    const response = await POST(signedRequest('{}'));

    expect(await response.json()).toEqual({ received: true, stale: true });
    const unchanged = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(unchanged.stripeSubscriptionId).toBe('sub_current');
    expect(unchanged.stripeStatus).toBe('active');
  });

  it('accepts unknown event types without changing subscription fields', async () => {
    mockConstructEvent.mockReturnValueOnce(stripeEvent('evt_unknown', 'invoice.payment_succeeded', {
      id: 'in_123',
      customer: stripeCustomerId,
    }));

    const res = await POST(signedRequest('{}'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const unchanged = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(unchanged.stripeStatus).toBeNull();
    expect(unchanged.stripeSubscriptionId).toBeNull();
  });
});

function signedRequest(body: string) {
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 'test_signature' },
    body,
  });
}

function stripeEvent(id: string, type: string, object: unknown, created = 250): Stripe.Event {
  return {
    id,
    type,
    created,
    data: { object },
  } as Stripe.Event;
}
