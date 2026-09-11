export const CHANNEL_TYPE = {
  IG_DM: 'ig_dm',
  EMAIL: 'email',
  TIKTOK: 'tiktok',
  SHOPIFY: 'shopify',
  // Storefront chat widget. Distinct from SHOPIFY, which is merchant-side and
  // falls back to email — this one delivers into the shopper's open widget.
  SHOPIFY_CHAT: 'shopify_chat',
  IMESSAGE: 'imessage',
  SMS: 'sms',
  OPERATOR: 'operator',
  DASHBOARD_AGENT: 'dashboard_agent',
} as const;

// Operator-facing channels (Concierge + Telegram/iMessage). Single source of truth for
// the operator-class predicate — do not re-spell `channelType === ...` for this.
export const OPERATOR_CHANNEL_TYPES = new Set<string>([
  CHANNEL_TYPE.DASHBOARD_AGENT,
  CHANNEL_TYPE.OPERATOR,
]);

export function isOperatorChannel(channelType: string | null | undefined): boolean {
  if (!channelType) return false;
  return OPERATOR_CHANNEL_TYPES.has(channelType);
}

// What a channel is called in front of a person — badges, KB provenance, digest
// copy. One map, because it had drifted into two that disagreed.
//
// `operator` is deliberately not a provider name. It is the merchant's own
// thread with the agent and it carries Telegram *and* iMessage, so naming
// either one mislabels the other. It was `sms_agent` until 2026-09-11, which
// named a third transport it has never used. The provider is knowable from
// `OperatorEvent.channel` where it matters; it is not a property of the thread.
export const CHANNEL_DISPLAY_NAME: Readonly<Record<string, string>> = {
  [CHANNEL_TYPE.EMAIL]: 'Email',
  [CHANNEL_TYPE.IG_DM]: 'Instagram',
  [CHANNEL_TYPE.TIKTOK]: 'TikTok Shop',
  [CHANNEL_TYPE.SHOPIFY]: 'Shopify',
  [CHANNEL_TYPE.SHOPIFY_CHAT]: 'Storefront chat',
  [CHANNEL_TYPE.IMESSAGE]: 'iMessage',
  [CHANNEL_TYPE.SMS]: 'SMS',
  [CHANNEL_TYPE.OPERATOR]: 'Messages',
  [CHANNEL_TYPE.DASHBOARD_AGENT]: 'Dashboard',
};

export function channelDisplayName(
  channelType: string | null | undefined,
  fallback: string,
): string {
  return (channelType && CHANNEL_DISPLAY_NAME[channelType]) || fallback;
}

export const THREAD_STATUS = {
  OPEN: 'open',
  PENDING: 'pending',
  CLOSED: 'closed',
} as const;

export const SENDER_TYPE = {
  CUSTOMER: 'customer',
  AGENT: 'agent',
  NOTE: 'note',
  AI: 'ai',
} as const;

export const AGENT_NOTE_PREFIX = "__shopkeeper_agent_note__";

export function isAgentNoteContent(contentText: string | null | undefined): boolean {
  if (!contentText) return false;
  return contentText.startsWith(AGENT_NOTE_PREFIX);
}

export function stripAgentNotePrefix(contentText: string): string {
  return contentText.startsWith(AGENT_NOTE_PREFIX)
    ? contentText.slice(AGENT_NOTE_PREFIX.length)
    : contentText;
}
