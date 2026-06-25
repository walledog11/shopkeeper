export const CHANNEL_TYPE = {
  IG_DM: 'ig_dm',
  EMAIL: 'email',
  TIKTOK: 'tiktok',
  SHOPIFY: 'shopify',
  IMESSAGE: 'imessage',
  SMS: 'sms',
  SMS_AGENT: 'sms_agent',
  DASHBOARD_AGENT: 'dashboard_agent',
} as const;

// Operator-facing channels (Concierge + Telegram). Single source of truth for
// the operator-class predicate — do not re-spell `channelType === ...` for this.
export const OPERATOR_CHANNEL_TYPES = new Set<string>([
  CHANNEL_TYPE.DASHBOARD_AGENT,
  CHANNEL_TYPE.SMS_AGENT,
]);

export function isOperatorChannel(channelType: string | null | undefined): boolean {
  if (!channelType) return false;
  return OPERATOR_CHANNEL_TYPES.has(channelType);
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
