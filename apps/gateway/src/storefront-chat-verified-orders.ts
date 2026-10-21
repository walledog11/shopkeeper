import { db } from '@shopkeeper/db';
import { ORDER_VERIFICATION_CHANNELS } from '@shopkeeper/agent/order-verification';
import { CHANNEL } from './constants.js';

export interface ConfirmedOrder {
  orderName: string;
  /** What the sender showed they know: the email on the order, or its shipping zip. */
  method: 'email' | 'zip';
}

/**
 * The orders this conversation's sender has shown are theirs, for the operator
 * card. A storefront shopper entered a code mailed to the order's email; an
 * Instagram or TikTok sender sent the order's email or shipping zip, read from
 * the rows buildContext reads: the connected store's only, so the card never
 * vouches for a same-named order in another store.
 */
export async function listConfirmedOrders(
  organizationId: string,
  threadId: string,
  channelType: string,
): Promise<ConfirmedOrder[]> {
  if (ORDER_VERIFICATION_CHANNELS.has(channelType)) {
    const integration = await db.integration.findFirst({
      where: { organizationId, platform: 'shopify', lifecycleStatus: 'active' },
      select: { externalAccountId: true },
    });
    if (!integration) return [];
    const rows = await db.orderVerification.findMany({
      where: {
        organizationId,
        shopDomain: integration.externalAccountId,
        verifiedAt: { not: null },
        customer: { threads: { some: { id: threadId, organizationId } } },
      },
      orderBy: { verifiedAt: 'asc' },
      select: { orderName: true, method: true },
    });
    return rows.flatMap(row => (
      row.orderName && row.method ? [{ orderName: row.orderName, method: row.method }] : []
    ));
  }
  const names = await listVerifiedOrderNames(organizationId, threadId, channelType);
  return names.map(orderName => ({ orderName, method: 'email' as const }));
}

// The same predicate buildContext uses to promote a storefront session out of
// guest (packages/agent/src/context.ts): a verified row on a session that has
// not been revoked. Read again here because the classifier and the operator
// card both run outside buildContext — which is why they went on describing a
// shopper who had just proved control of an order's email as an unidentified
// visitor, on the one channel where that distinction decides what may be said.
//
// Matched through the session's episode history, not its current `threadId`.
// Both readers must agree across an episode boundary, or the operator card and
// the agent would disagree about whether the same shopper is verified.
export async function listVerifiedOrderNames(
  organizationId: string,
  threadId: string,
  channelType: string,
): Promise<string[]> {
  if (channelType !== CHANNEL.SHOPIFY_CHAT) return [];
  const rows = await db.storefrontChatVerification.findMany({
    where: {
      organizationId,
      verifiedAt: { not: null },
      session: { revokedAt: null, episodes: { some: { threadId } } },
    },
    select: { orderName: true },
  });
  return rows.map((row) => row.orderName);
}

/**
 * The same predicate for a whole briefing at once. The digest renders every open
 * thread in one message, so the per-thread form above would issue one query per
 * storefront ticket; this issues one. Threads with no verification are absent
 * from the map rather than present-and-empty, so callers read a missing key the
 * same way they read an unverified session.
 *
 * Verification is session-scoped, so it reaches every episode that session has
 * held — the same reason the single-thread form matches through `episodes`
 * rather than the session's current `threadId`.
 */
export async function listVerifiedOrderNamesByThread(
  organizationId: string,
  threadIds: readonly string[],
): Promise<Map<string, string[]>> {
  const byThread = new Map<string, string[]>();
  if (threadIds.length === 0) return byThread;

  const wanted = new Set(threadIds);
  const rows = await db.storefrontChatVerification.findMany({
    where: {
      organizationId,
      verifiedAt: { not: null },
      session: { revokedAt: null, episodes: { some: { threadId: { in: [...wanted] } } } },
    },
    select: {
      orderName: true,
      session: { select: { episodes: { select: { threadId: true } } } },
    },
  });

  for (const row of rows) {
    // A session's episode list can reach threads outside this briefing; only the
    // ones asked for get an entry.
    for (const episode of row.session.episodes) {
      if (!wanted.has(episode.threadId)) continue;
      const names = byThread.get(episode.threadId);
      if (!names) {
        byThread.set(episode.threadId, [row.orderName]);
      } else if (!names.includes(row.orderName)) {
        names.push(row.orderName);
      }
    }
  }
  return byThread;
}
