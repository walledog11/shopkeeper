import { db } from './index.js';

// Per-org plan limits. The tier ladder sells volume and seats, not features:
// every plan runs the whole product (decision 2026-08-19, `c558c788`), so
// nothing here gates a tool or a capability. Re-gating Shopify actions, phone
// approvals or voice training behind a tier would reverse that decision, and
// this module is deliberately not the place to do it.

export type PlanTier = 'starter' | 'pro' | 'unknown';

export interface PlanLimits {
  // `null` means unbounded.
  conversationsPerMonth: number | null;
  seats: number | null;
}

// The numbers are the ones the pricing page carried before `c558c788` removed
// them for being unenforced — recovered rather than reinvented, so enforcement
// and the page agree when the page carries them again.
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  starter: { conversationsPerMonth: 500, seats: 1 },
  pro: { conversationsPerMonth: null, seats: 2 },
  // An org whose price ID we cannot attribute to a plan — which today is every
  // org, since PRICE_ID_STARTER and PRICE_ID_PRO are still unprovisioned in
  // production — is deliberately unbounded. Capping a workspace on the strength
  // of a missing env var would degrade real merchants for a configuration gap
  // they cannot see, so the unknown case fails open on purpose. The cap starts
  // biting when a real subscription carries a price ID we recognise.
  unknown: { conversationsPerMonth: null, seats: null },
};

export function resolvePlanTier(
  stripePriceId: string | null | undefined,
  priceIds: { starter?: string; pro?: string },
): PlanTier {
  if (!stripePriceId) return 'unknown';
  if (priceIds.starter && stripePriceId === priceIds.starter) return 'starter';
  if (priceIds.pro && stripePriceId === priceIds.pro) return 'pro';
  return 'unknown';
}

export function planLimitsFor(
  stripePriceId: string | null | undefined,
  priceIds: { starter?: string; pro?: string },
): PlanLimits {
  return PLAN_LIMITS[resolvePlanTier(stripePriceId, priceIds)];
}

// The billing period is the UTC calendar month, matching how `utcDayString`
// buckets LLM spend — one vocabulary for "what period is this counter in".
export function utcMonthString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function utcMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// Operator surfaces are the merchant talking to their own agent, not a customer
// conversation, so they never count against a plan that is sold per customer
// conversation.
const INTERNAL_CHANNEL_TYPES = ['sms_agent', 'dashboard_agent'] as const;

// A "conversation" is a thread opened in the period. Counting threads rather
// than messages means a long back-and-forth with one customer costs the same as
// a single question, which is how the page described it.
export async function countConversationsThisMonth(
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  return db.thread.count({
    where: {
      organizationId,
      createdAt: { gte: utcMonthStart(now) },
      channelType: { notIn: [...INTERNAL_CHANNEL_TYPES] },
      deletedAt: null,
    },
  });
}

export interface ConversationAllowance {
  tier: PlanTier;
  limit: number | null;
  used: number;
  overLimit: boolean;
}

export async function getConversationAllowance(
  organizationId: string,
  stripePriceId: string | null | undefined,
  priceIds: { starter?: string; pro?: string },
  now: Date = new Date(),
): Promise<ConversationAllowance> {
  const tier = resolvePlanTier(stripePriceId, priceIds);
  const limit = PLAN_LIMITS[tier].conversationsPerMonth;
  if (limit === null) {
    return { tier, limit: null, used: 0, overLimit: false };
  }
  const used = await countConversationsThisMonth(organizationId, now);
  return { tier, limit, used, overLimit: used > limit };
}
