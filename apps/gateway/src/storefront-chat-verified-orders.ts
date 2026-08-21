import { db } from '@shopkeeper/db';
import { CHANNEL } from './constants.js';

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
