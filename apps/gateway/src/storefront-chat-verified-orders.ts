import { db } from '@shopkeeper/db';
import { CHANNEL } from './constants.js';

// The same predicate buildContext uses to promote a storefront session out of
// guest (packages/agent/src/context.ts): a verified row on a session that has
// not been revoked. Read again here because the classifier and the operator
// card both run outside buildContext — which is why they went on describing a
// shopper who had just proved control of an order's email as an unidentified
// visitor, on the one channel where that distinction decides what may be said.
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
      session: { threadId, revokedAt: null },
    },
    select: { orderName: true },
  });
  return rows.map((row) => row.orderName);
}
