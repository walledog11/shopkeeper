import { db, utcDayString } from '@shopkeeper/db';
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
 * Called before `processInboundMessage`, so a denial costs nothing beyond the
 * checks themselves. The counters move only on an admitted message: a refused
 * message must not consume the budget it was refused by, or a shopper who keeps
 * retrying would push their own reset further away.
 */
export async function claimStorefrontChatBudget(input: {
  organizationId: string;
  integrationId: string;
  sessionId: string;
  sessionMessageCount: number;
  shopperIp: string | null;
}): Promise<StorefrontChatBudgetVerdict> {
  const { organizationId, integrationId, sessionId, sessionMessageCount, shopperIp } = input;
  const budgets = getStorefrontChatMessageBudgets();
  const limits = getStorefrontChatBurstLimits();
  const redis = counterClient();

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

  if (sessionMessageCount >= budgets.perSession) {
    return { allowed: false, denial: 'session_budget' };
  }

  const day = utcDayString();
  // Upsert-then-read rather than read-then-write: concurrent shoppers on one
  // shop race here, and the unique (integration_id, day) index makes the
  // increment atomic. The returned count is this message's position in the day,
  // so admitting exactly the first `perShopPerDay` of them is a `>` test.
  const usage = await db.storefrontChatDailyUsage.upsert({
    where: { integrationId_day: { integrationId, day } },
    create: { organizationId, integrationId, day, messageCount: 1 },
    update: { messageCount: { increment: 1 } },
    select: { messageCount: true },
  });

  if (usage.messageCount > budgets.perShopPerDay) {
    // Over budget. The counter deliberately keeps climbing past the ceiling —
    // it is how sustained exhaustion is distinguished from just touching the
    // limit when reading the logs afterwards.
    logger.warn(
      { opsAlert: true, organizationId, integrationId, day, messageCount: usage.messageCount, limit: budgets.perShopPerDay },
      '[StorefrontChat] Shop daily message budget exhausted',
    );
    // Only the message that crosses the ceiling tells the merchant. Every
    // refusal after it is the same fact, and a shop under sustained load would
    // otherwise turn one closed widget into hundreds of notifications. The
    // idempotency key covers the races this integer test cannot.
    if (usage.messageCount === budgets.perShopPerDay + 1) {
      await alertStorefrontChatExhaustion({
        organizationId,
        integrationId,
        day,
        limit: budgets.perShopPerDay,
      });
    }
    return { allowed: false, denial: 'shop_budget' };
  }

  await db.storefrontChatSession.update({
    where: { id: sessionId },
    data: { messageCount: { increment: 1 } },
  });

  return ALLOWED;
}

// What the widget is told. Deliberately vague about which limit was hit — a
// shopper cannot act on the difference, and spelling it out would hand an abuser
// a map of the thresholds.
export function storefrontChatDenialMessage(denial: StorefrontChatBudgetDenial): string {
  return denial === 'session_burst' || denial === 'ip_burst'
    ? "You're sending messages faster than we can read them. Give it a moment and try again."
    : "We've hit today's chat limit. Please email us and we'll pick this up from there.";
}

export { ALLOWED as STOREFRONT_CHAT_BUDGET_ALLOWED };
