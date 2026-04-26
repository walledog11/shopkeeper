export const CHANNEL_TYPE = {
  IG_DM: 'ig_dm',
  EMAIL: 'email',
  TIKTOK: 'tiktok',
  SHOPIFY: 'shopify',
  SMS: 'sms',
  SMS_AGENT: 'sms_agent',
  DASHBOARD_AGENT: 'dashboard_agent',
} as const;

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

export const AGENT_NOTE_PREFIX = "__clerk_agent_note__";
