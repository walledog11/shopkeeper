import { db, getConversationAllowance, utcMonthString } from '@shopkeeper/db';
import { getBillingPriceIds } from '../config/env.js';
import logger from '../logger.js';
import { sendConversationLimitNotification } from './planning-notifications.js';

const NOTICE_MONTH_KEY = 'conversationLimitNoticeMonth';

// Once per billing period, not once per message. An org that is over its cap
// keeps receiving customer messages, so without this marker the merchant would
// be texted on every one of them. The operator-notify dedupe cannot carry this:
// it is a one-hour Redis TTL.
//
// Known limitation, accepted deliberately: `buildSettingsUpdate` rebuilds
// settings from `normalizeStoredOrgSettings`, which is a whitelist, so this key
// is dropped whenever the merchant saves any org setting. The cost is one
// duplicate notice that month — self-limiting, and the notice is still true when
// it arrives. Every fix is more expensive than the bug: a dedicated column means
// a migration and its deploy-ordering landmine, adding the key to the stored
// settings whitelist means an eval run against `packages/agent`, and a per-call
// Redis TTL means threading an optional argument through the notify path every
// proactive send shares. Revisit if merchants start seeing repeats.
async function claimPeriodNotice(organizationId: string, period: string): Promise<boolean> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!org) return false;

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  if (settings[NOTICE_MONTH_KEY] === period) return false;

  await db.organization.update({
    where: { id: organizationId },
    data: { settings: { ...settings, [NOTICE_MONTH_KEY]: period } },
  });
  return true;
}

// Returns true when planning should be skipped for this thread.
//
// Fails open on every error path. A cap is a commercial control, not a safety
// one, so a database hiccup while reading it must let the plan through rather
// than silently stop the agent working — the opposite bias from the spend cap,
// which protects against real money and fails closed.
export async function degradeForConversationLimit(
  organizationId: string,
  threadId: string,
): Promise<boolean> {
  try {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { stripePriceId: true },
    });
    const allowance = await getConversationAllowance(
      organizationId,
      org?.stripePriceId ?? null,
      getBillingPriceIds(),
    );
    if (!allowance.overLimit || allowance.limit === null) return false;

    logger.warn(
      {
        organizationId,
        threadId,
        opsAlert: true,
        purpose: 'conversation_limit_degrade',
        tier: allowance.tier,
        limit: allowance.limit,
        used: allowance.used,
      },
      '[Worker] Org over its monthly conversation allowance — planning paused, ingestion unaffected',
    );

    const period = utcMonthString();
    if (await claimPeriodNotice(organizationId, period)) {
      await sendConversationLimitNotification(
        organizationId,
        threadId,
        { tier: allowance.tier, limit: allowance.limit, used: allowance.used },
        period,
      );
    }
    return true;
  } catch (err) {
    logger.error(
      { err, organizationId, threadId },
      '[Worker] Conversation allowance check failed — planning anyway',
    );
    return false;
  }
}
