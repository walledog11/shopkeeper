/**
 * Finds the live-test Instagram sender by handle. A customer's stored name comes
 * from a best-effort SocialAPI lookup and is empty when that lookup fails, so the
 * reset and the preflight also match the sender id SocialAPI shows for the
 * handle, which is the id every message from that account is stored under.
 */
import { db } from '@shopkeeper/db';
import { createSocialApiClient, type SocialApiInstagramConversation } from '@shopkeeper/integrations/socialapi';
import { getSocialApiApiKey } from '../config/runtime-config.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

type Lookup<T> = ({ ok: true } & T) | { ok: false; reason: string };

/** The store's SocialAPI conversations with `handle`, newest first. */
export async function findInstagramConversations(
  organizationId: string,
  handle: string,
): Promise<Lookup<{ accountId: string; conversations: SocialApiInstagramConversation[] }>> {
  const apiKey = getSocialApiApiKey();
  if (!apiKey) return { ok: false, reason: 'SOCIALAPI_API_KEY is not set' };
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'ig_dm', lifecycleStatus: 'active', providerAccountId: { not: null } },
    select: { providerAccountId: true },
  });
  if (!integration?.providerAccountId) return { ok: false, reason: 'no SocialAPI Instagram connection' };

  const client = createSocialApiClient({ apiKey });
  const wanted = handle.toLowerCase();
  const conversations: SocialApiInstagramConversation[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await client.listInstagramConversations({
      accountId: integration.providerAccountId,
      limit: PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    if (!result.ok) return { ok: false, reason: `SocialAPI returned ${result.error.category}` };
    conversations.push(...result.data.data.filter(conversation => (
      conversation.participantName?.replace(/^@/, '').toLowerCase() === wanted
    )));
    if (!result.data.hasMore || !result.data.nextCursor) break;
    cursor = result.data.nextCursor;
  }
  conversations.sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
  return { ok: true, accountId: integration.providerAccountId, conversations };
}

export async function findInstagramSenderIds(organizationId: string, handle: string): Promise<Lookup<{ senderIds: string[] }>> {
  const found = await findInstagramConversations(organizationId, handle);
  if (!found.ok) return found;
  return { ok: true, senderIds: [...new Set(found.conversations.map(conversation => conversation.participantId))] };
}
