import { db } from '@shopkeeper/db';
import logger from './logger.js';
import { listOperatorBindings, notifyOperator } from './operator-notify.js';

export interface StorefrontChatExhaustionAlert {
  organizationId: string;
  integrationId: string;
  /** UTC day the counter belongs to, `YYYY-MM-DD`. */
  day: string;
  limit: number;
}

/**
 * One notice per shop per UTC day, keyed so a retry or a concurrent refusal
 * cannot send a second.
 */
export function storefrontChatExhaustionIdempotencyKey(
  organizationId: string,
  integrationId: string,
  day: string,
): string {
  return `storefront-chat-exhausted:${organizationId}:${integrationId}:${day}`;
}

export function formatStorefrontChatExhaustionMessage(limit: number, shop: string | null): string {
  // A report, not a card. There is no decision here for the merchant to approve
  // — the widget has already stopped answering — so it ends in a fact and an
  // option rather than a question.
  const where = shop ? `Your storefront chat on ${shop}` : 'Your storefront chat';
  return [
    `${where} hit today's limit of ${limit} messages.`,
    "It's turning shoppers away until midnight UTC — they're asked to email you instead.",
    "If the storefront is really that busy, the limit can go up. If it isn't, something is hammering the widget.",
  ].join('\n');
}

/**
 * Tell the merchant their storefront chat has stopped answering.
 *
 * Called once, on the message that crosses the ceiling — not on the refusals
 * that follow it, which is what keeps a sustained flood from becoming a flood of
 * notifications. Never throws: this runs inside the refusal path, and failing to
 * report a closed widget must not also break closing it.
 */
export async function alertStorefrontChatExhaustion(
  alert: StorefrontChatExhaustionAlert,
): Promise<number> {
  const { organizationId, integrationId, day, limit } = alert;
  try {
    const members = await listOperatorBindings(organizationId);
    if (members.length === 0) {
      logger.info(
        { organizationId, integrationId, day },
        '[StorefrontChat] Budget exhausted with no bound operator to tell',
      );
      return 0;
    }

    const integration = await db.integration.findFirst({
      where: { id: integrationId, organizationId },
      select: { externalAccountId: true },
    });
    const message = formatStorefrontChatExhaustionMessage(limit, integration?.externalAccountId ?? null);
    const idempotencyKey = storefrontChatExhaustionIdempotencyKey(organizationId, integrationId, day);

    let notified = 0;
    for (const member of members) {
      try {
        const result = await notifyOperator(organizationId, member, message, {}, { idempotencyKey });
        if (result) notified += 1;
      } catch (err) {
        logger.warn(
          { organizationId, integrationId, err: err instanceof Error ? err.message : String(err) },
          '[StorefrontChat] Failed to push budget-exhaustion notice to a bound operator',
        );
      }
    }
    return notified;
  } catch (err) {
    logger.error(
      { opsAlert: true, organizationId, integrationId, day, err: err instanceof Error ? err.message : String(err) },
      '[StorefrontChat] Budget-exhaustion alert failed entirely',
    );
    return 0;
  }
}
