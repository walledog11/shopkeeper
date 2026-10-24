import { utcDayString } from '@shopkeeper/db';
import type { EpisodeTransactionClient } from './message-handlers/inbound/resolve-inbound-episode.js';
import { fixedWindowRateLimit, type FixedWindowCounterClient } from '@shopkeeper/agent/rate-limit';
import logger from './logger.js';
import { getGatewayRedis } from './clients/redis-client.js';
import {
  getStorefrontChatBurstLimits,
  getStorefrontChatMessageBudgets,
} from './config/runtime-config.js';
import { alertStorefrontChatExhaustion } from './storefront-chat-exhaustion-alert.js';

// The storefront's own containment, enforced entirely before the model runs.
//
// Two layers, because they stop different things. The burst limits stop a flood
// inside a minute; the daily budgets stop a slow drip that would still drain the
// merchant's LLM cap over a day. Neither consults `llm_daily_spend`: refusing
// here has to leave the org cap, and the email and Instagram agents that share
// it, completely untouched.

export type StorefrontChatBudgetDenial =
  | 'session_burst'
  | 'ip_burst'
  | 'session_budget'
  | 'shop_budget';

export interface StorefrontChatBudgetVerdict {
  allowed: boolean;
  denial?: StorefrontChatBudgetDenial;
  /** Unix seconds at which the offending window resets, for `Retry-After`. */
  retryAt?: number;
}

const ALLOWED: StorefrontChatBudgetVerdict = { allowed: true };

export class StorefrontChatBudgetError extends Error {
  constructor(readonly verdict: StorefrontChatBudgetVerdict) {
    super('Storefront chat budget exhausted');
  }
}

export class StorefrontChatSessionUnavailableError extends Error {}

// Burst limits fail **closed** in production, matching the gateway's other
// limiter: an unreachable Redis must not become an open door on the one route
// an anonymous stranger can reach. Outside production they fail open, so a
// developer or a test run without REDIS_URL is not blocked — the daily budgets
// below are Postgres-backed and keep working either way.
function failOpen(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function counterClient(): FixedWindowCounterClient | null {
  try {
    return getGatewayRedis();
  } catch {
    return null;
  }
}

async function burst(
  client: FixedWindowCounterClient | null,
  key: string,
  limit: number,
  windowSecs: number,
): Promise<{ ok: boolean; reset: number }> {
  const reset = Math.floor(Date.now() / 1000) + windowSecs;
  if (!client) return { ok: failOpen(), reset };

  const result = await fixedWindowRateLimit(client, key, {
    limit,
    windowSecs,
    failOpen: failOpen(),
  });
  return { ok: result.success, reset: result.reset };
}

/**
 * Decide whether one shopper message may be admitted, and account for it if so.
 *
 * Called inside inbound persistence's transaction, after its unique message
 * insert and before commit or model work. Throw on refusal to roll back the
 * message, episode and counters together. Duplicate inserts never reach here.
 */
export async function claimStorefrontChatBudget(input: {
  organizationId: string;
  integrationId: string;
  sessionId: string;
  shopperIp: string | null;
}, tx: EpisodeTransactionClient): Promise<StorefrontChatBudgetVerdict> {
  const { organizationId, integrationId, sessionId, shopperIp } = input;
  const budgets = getStorefrontChatMessageBudgets();
  const limits = getStorefrontChatBurstLimits();
  const redis = counterClient();

  // This update locks the session until the inbound transaction commits. The
  // count read below cannot race another admitted message on the same browser.
  const live = await tx.storefrontChatSession.updateMany({
    where: {
      id: sessionId, organizationId, integrationId, revokedAt: null, expiresAt: { gt: new Date() },
      organization: { lifecycleStatus: 'active' },
      integration: { lifecycleStatus: 'active', metadata: { path: ['storefrontChat', 'enabled'], equals: true } },
    },
    data: { lastSeenAt: new Date() },
  });
  if (!live.count) throw new StorefrontChatSessionUnavailableError('Storefront chat session is unavailable');
  const session = await tx.storefrontChatSession.findUniqueOrThrow({ where: { id: sessionId }, select: { messageCount: true } });

  const sessionBurst = await burst(
    redis,
    `storefront-chat:session:${sessionId}`,
    limits.perSession,
    limits.windowSecs,
  );
  if (!sessionBurst.ok) {
    return { allowed: false, denial: 'session_burst', retryAt: sessionBurst.reset };
  }

  // Keyed on the shop as well as the address so one noisy shopper cannot rate
  // limit the same address on an unrelated merchant's storefront.
  if (shopperIp) {
    const ipBurst = await burst(
      redis,
      `storefront-chat:ip:${integrationId}:${shopperIp}`,
      limits.perIp,
      limits.windowSecs,
    );
    if (!ipBurst.ok) {
      return { allowed: false, denial: 'ip_burst', retryAt: ipBurst.reset };
    }
  }

  if (session.messageCount >= budgets.perSession) {
    return { allowed: false, denial: 'session_budget' };
  }

  const day = utcDayString();
  // Upsert-then-read rather than read-then-write: concurrent shoppers on one
  // shop race here, and the unique (integration_id, day) index makes the
  // increment atomic. The returned count is this message's position in the day,
  // so admitting exactly the first `perShopPerDay` of them is a `>` test.
  const usage = await tx.storefrontChatDailyUsage.upsert({
    where: { integrationId_day: { integrationId, day } },
    create: { organizationId, integrationId, day, messageCount: 1 },
    update: { messageCount: { increment: 1 } },
    select: { messageCount: true },
  });

  if (usage.messageCount > budgets.perShopPerDay) {
    return { allowed: false, denial: 'shop_budget' };
  }

  await tx.storefrontChatSession.update({
    where: { id: sessionId },
    data: { messageCount: { increment: 1 } },
  });

  return ALLOWED;
}

// Outside the admission transaction. The notification's durable idempotency
// key allows only one merchant notice per shop/day, including concurrent refusals.
export async function reportStorefrontChatExhaustion(organizationId: string, integrationId: string): Promise<void> {
  const day = utcDayString();
  const limit = getStorefrontChatMessageBudgets().perShopPerDay;
  logger.warn({ opsAlert: true, organizationId, integrationId, day, limit }, '[StorefrontChat] Shop daily message budget exhausted');
  await alertStorefrontChatExhaustion({ organizationId, integrationId, day, limit });
}

// What the widget is told. Deliberately vague about which limit was hit — a
// shopper cannot act on the difference, and spelling it out would hand an abuser
// a map of the thresholds.
export function storefrontChatDenialMessage(denial: StorefrontChatBudgetDenial): string {
  if (denial === 'session_burst' || denial === 'ip_burst') {
    return "You're sending messages faster than we can read them. Give it a moment and try again.";
  }
  return denial === 'session_budget'
    ? "This chat has reached its message limit. Please use the shop's contact page for more help."
    : "We've hit today's chat limit. Please use the shop's contact page, or try again tomorrow.";
}
