export const CHANNEL_TYPE = {
  IG_DM: 'ig_dm',
  EMAIL: 'email',
  TIKTOK: 'tiktok',
  SHOPIFY: 'shopify',
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

export const LEGACY_AGENT_NOTE_PREFIX = "__clerk_agent_note__";
export const AGENT_NOTE_PREFIX = "__shopkeeper_agent_note__";

const AGENT_NOTE_PREFIXES = [AGENT_NOTE_PREFIX, LEGACY_AGENT_NOTE_PREFIX] as const;

export function isAgentNoteContent(contentText: string | null | undefined): boolean {
  if (!contentText) return false;
  return AGENT_NOTE_PREFIXES.some((prefix) => contentText.startsWith(prefix));
}

export function stripAgentNotePrefix(contentText: string): string {
  for (const prefix of AGENT_NOTE_PREFIXES) {
    if (contentText.startsWith(prefix)) {
      return contentText.slice(prefix.length);
    }
  }
  return contentText;
}
