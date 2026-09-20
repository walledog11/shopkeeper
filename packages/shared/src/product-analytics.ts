/** Customer-facing inbound channels that count toward workspace activation analytics. */
export const ACTIVATION_INBOUND_CHANNELS = [
  'email',
  'ig_dm',
  'tiktok',
  'shopify_chat',
] as const;

export type ActivationInboundChannel = (typeof ACTIVATION_INBOUND_CHANNELS)[number];

export const WORKSPACE_ACTIVATION_WINDOW_SECONDS = 7 * 24 * 60 * 60;
