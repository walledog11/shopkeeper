import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  installProductAnalytics,
  NoopAnalyticsSink,
  RecordingAnalyticsSink,
} from '@shopkeeper/analytics';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import type Stripe from 'stripe';

const { mockConstructEvent, mockRedisSet } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockRedisSet: vi.fn(),
}));

vi.mock('@/lib/billing/stripe', () => ({
  default: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  },
}));

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(() => ({
    set: mockRedisSet,
  })),
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
  mockRedisSet.mockResolvedValue('OK');
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

  it('dedupes replayed Stripe events before applying a second update', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: {
        stripeSubscriptionId: 'sub_existing',
        stripeStatus: 'active',
        stripePriceId: 'price_existing',
      },
    });
    mockRedisSet.mockResolvedValueOnce(null);
    mockConstructEvent.mockReturnValueOnce(stripeEvent('evt_duplicate', 'customer.subscription.updated', {
      id: 'sub_replayed',
      customer: stripeCustomerId,
      status: 'past_due',
      items: { data: [{ price: { id: 'price_replayed' } }] },
      trial_end: null,
    }));

    const res = await POST(signedRequest('{}'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });

    const unchanged = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(unchanged.stripeSubscriptionId).toBe('sub_existing');
    expect(unchanged.stripeStatus).toBe('active');
    expect(unchanged.stripePriceId).toBe('price_existing');
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
    }));

    const res = await POST(signedRequest('{}'));

    expect(res.status).toBe(200);
    const unchanged = await db.organization.findUniqueOrThrow({ where: { id: org!.id } });
    expect(unchanged.stripeStatus).toBe('canceled');
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

function stripeEvent(id: string, type: string, object: unknown): Stripe.Event {
  return {
    id,
    type,
    data: { object },
  } as Stripe.Event;
}
