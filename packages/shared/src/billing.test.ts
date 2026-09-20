import { describe, expect, it } from 'vitest';
import {
  billingPriceIdsRecord,
  parseBillingPriceIds,
  resolveAnalyticsSubscriptionPlan,
  resolveBillingPlanDisplayName,
} from './billing.js';

describe('parseBillingPriceIds', () => {
  it('parses starter and pro from env', () => {
    expect(
      parseBillingPriceIds({
        priceIdStarter: ' price_starter ',
        priceIdPro: 'price_pro',
      }),
    ).toEqual({ starter: 'price_starter', pro: 'price_pro' });
  });

  it('falls back pro to legacy PRICE_ID', () => {
    expect(
      parseBillingPriceIds({
        priceIdLegacy: 'price_legacy',
      }),
    ).toEqual({ pro: 'price_legacy' });
  });

  it('prefers PRICE_ID_PRO over legacy', () => {
    expect(
      parseBillingPriceIds({
        priceIdPro: 'price_pro',
        priceIdLegacy: 'price_legacy',
      }),
    ).toEqual({ pro: 'price_pro' });
  });
});

describe('resolveBillingPlanDisplayName', () => {
  const ids = parseBillingPriceIds({
    priceIdStarter: 'starter',
    priceIdPro: 'pro',
  });

  it('maps known tiers and defaults', () => {
    expect(resolveBillingPlanDisplayName(null, ids)).toBe('Free');
    expect(resolveBillingPlanDisplayName('starter', ids)).toBe('Starter');
    expect(resolveBillingPlanDisplayName('pro', ids)).toBe('Pro');
    expect(resolveBillingPlanDisplayName('other', ids)).toBe('Paid');
  });
});

describe('resolveAnalyticsSubscriptionPlan', () => {
  const ids = parseBillingPriceIds({
    priceIdStarter: 'starter',
    priceIdPro: 'pro',
  });

  it('maps analytics plans', () => {
    expect(resolveAnalyticsSubscriptionPlan(null, ids)).toBe('free');
    expect(resolveAnalyticsSubscriptionPlan('starter', ids)).toBe('starter');
    expect(resolveAnalyticsSubscriptionPlan('pro', ids)).toBe('pro');
    expect(resolveAnalyticsSubscriptionPlan('unknown', ids)).toBeNull();
  });
});

describe('billingPriceIdsRecord', () => {
  it('exposes undefined slots for dashboard callers', () => {
    expect(billingPriceIdsRecord({})).toEqual({ starter: undefined, pro: undefined });
  });
});
