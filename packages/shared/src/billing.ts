/** Stripe price IDs for Starter / Pro, as read from host env. */
export type BillingPriceIds = { starter?: string; pro?: string };

export type BillingPriceEnv = {
  priceIdStarter?: string | null;
  priceIdPro?: string | null;
  /** Legacy alias for Pro when PRICE_ID_PRO is unset. */
  priceIdLegacy?: string | null;
};

function trimOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseBillingPriceIds(env: BillingPriceEnv): BillingPriceIds {
  const starter = trimOrUndefined(env.priceIdStarter);
  const pro = trimOrUndefined(env.priceIdPro) ?? trimOrUndefined(env.priceIdLegacy);
  return {
    ...(starter ? { starter } : {}),
    ...(pro ? { pro } : {}),
  };
}

export function billingPriceIdsRecord(
  ids: BillingPriceIds,
): Record<'starter' | 'pro', string | undefined> {
  return { starter: ids.starter, pro: ids.pro };
}

export function resolveBillingPlanDisplayName(
  priceId: string | null,
  priceIds: BillingPriceIds,
): string {
  if (!priceId) return 'Free';
  if (priceIds.starter && priceId === priceIds.starter) return 'Starter';
  if (priceIds.pro && priceId === priceIds.pro) return 'Pro';
  return 'Paid';
}

export type AnalyticsSubscriptionPlan = 'free' | 'starter' | 'pro';

export function resolveAnalyticsSubscriptionPlan(
  priceId: string | null,
  priceIds: BillingPriceIds,
): AnalyticsSubscriptionPlan | null {
  if (!priceId) return 'free';
  if (priceIds.starter && priceId === priceIds.starter) return 'starter';
  if (priceIds.pro && priceId === priceIds.pro) return 'pro';
  return null;
}
