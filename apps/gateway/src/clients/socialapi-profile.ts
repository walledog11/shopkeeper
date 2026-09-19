import { createSocialApiClient } from '@shopkeeper/integrations/socialapi';

import { getSocialApiApiKey } from '../config/runtime-config.js';

export interface SocialApiParticipantProfile {
  name: string | null;
}

// SocialAPI carries the shopper's display name on the conversation, not the
// message: `sender_name` was null on every row of the controlled account on
// 2026-09-12 while `participant_name` held the Instagram handle. Enrichment
// therefore reads the conversation list and matches the webhook's conversation
// id; there is no single-conversation endpoint to read instead.
const CONVERSATION_PAGE_SIZE = 25;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 1_000;

const profileCache = new Map<string, { expiresAt: number; profile: SocialApiParticipantProfile }>();

export async function fetchSocialApiParticipantProfile(input: {
  accountId: string;
  conversationId: string;
  participantId: string;
}): Promise<SocialApiParticipantProfile | null> {
  const apiKey = getSocialApiApiKey();
  if (!apiKey) return null;

  const key = `${input.accountId}\0${input.conversationId}\0${input.participantId}`;
  const cached = profileCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  const result = await createSocialApiClient({ apiKey }).listInstagramConversations({
    accountId: input.accountId,
    limit: CONVERSATION_PAGE_SIZE,
  });
  if (!result.ok) throw new SocialApiProfileError(result.error.category, result.error.httpStatus);

  const conversation = result.data.data.find(candidate => candidate.id === input.conversationId);
  // The conversation exists but fell off the first page, which a busy inbox makes
  // ordinary. Not an error, and not worth paging for a display name.
  if (!conversation) return null;

  // The name is only this sender's if the conversation's participant is this
  // sender. Both sides are the same SocialAPI author id that becomes
  // Customer.platformId, so bind them rather than trusting the conversation's
  // position in the list — a mismatched row would put one shopper's handle on
  // another's ticket, and the merchant would have no way to see it was wrong.
  if (conversation.participantId !== input.participantId) return null;

  // `participant_picture` is deliberately not read: it is a temporary signed
  // Instagram CDN URL, the same class this worker refuses to persist for Meta
  // profile images and message attachments. An avatar needs the Blob download
  // path, not a stored URL that expires.
  const profile: SocialApiParticipantProfile = { name: conversation.participantName };
  if (profileCache.size >= CACHE_MAX_ENTRIES) {
    profileCache.delete(profileCache.keys().next().value!);
  }
  profileCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, profile });
  return profile;
}

export class SocialApiProfileError extends Error {
  constructor(readonly category: string, readonly httpStatus: number) {
    super(`SocialAPI profile lookup failed (${category})`);
    this.name = 'SocialApiProfileError';
  }
}
