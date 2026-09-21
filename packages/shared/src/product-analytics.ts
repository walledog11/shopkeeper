/** Customer-facing inbound channels that count toward workspace activation analytics. */
export const ACTIVATION_INBOUND_CHANNELS = [
  'email',
  'ig_dm',
  'tiktok',
  'shopify_chat',
] as const;

export type ActivationInboundChannel = (typeof ACTIVATION_INBOUND_CHANNELS)[number];

export const WORKSPACE_ACTIVATION_WINDOW_SECONDS = 7 * 24 * 60 * 60;

/** Merchant/operator thread channels excluded from customer inbox analytics and audits. */
export const INTERNAL_OPERATOR_THREAD_CHANNELS = ['operator'] as const;

/** Retired `ChannelType` values dropped by migration 20260920120000. */
export const RETIRED_THREAD_CHANNEL_TYPES = ['sms', 'imessage', 'sms_agent', 'dashboard_agent'] as const;
