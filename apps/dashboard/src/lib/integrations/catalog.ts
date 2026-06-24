export type ConnectType = 'email' | 'ig' | 'shopify' | 'imessage'
export type EmailProviderFilter = 'gmail' | 'outlook' | 'postmark'
export type IntegrationChannelKind = 'operator' | 'support'

export interface PlatformConfig {
  id: string
  platform: string | null
  emailProvider?: EmailProviderFilter
  name: string
  logo: string | null
  logoSize?: number
  fullBleedLogo?: boolean
  tileClass?: string
  description: string
  connectType: ConnectType | null
  channelKind: IntegrationChannelKind
  comingSoon?: boolean
  permissions?: string[]
}

export const INTEGRATION_CHANNEL_SECTIONS: {
  kind: IntegrationChannelKind
  title: string
  description: string
}[] = [
  {
    kind: 'support',
    title: 'Support channels',
    description: 'Where customer messages arrive as tickets.',
  },
  {
    kind: 'operator',
    title: 'Operator channels',
    description: 'Connect your store and manage the agent from your phone.',
  },
]

const OPERATOR_CHANNEL_ORDER = ['imessage', 'telegram', 'shopify'] as const

export function sortPlatformConfigsByChannelKind(
  configs: PlatformConfig[],
  kind: IntegrationChannelKind,
): PlatformConfig[] {
  const filtered = configs.filter(def => def.channelKind === kind)
  if (kind !== 'operator') return filtered

  const order = new Map<string, number>(OPERATOR_CHANNEL_ORDER.map((id, index) => [id, index]))
  return [...filtered].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
}

export const PLATFORM_CONFIG: PlatformConfig[] = [
  {
    id: "shopify",
    platform: "shopify",
    name: "Shopify",
    logo: "/logos/shopify.svg",
    logoSize: 44,
    description: "Manage orders, customers, and refunds with live store data.",
    connectType: 'shopify',
    channelKind: 'operator',
  },
  {
    id: "gmail",
    platform: "email",
    emailProvider: "gmail",
    name: "Gmail",
    logo: "/logos/gmail.png",
    fullBleedLogo: true,
    description: "Route support mail, draft replies, and send responses from your Gmail inbox.",
    connectType: 'email',
    channelKind: 'support',
    permissions: [
      "Send replies from your Gmail address",
      "View your email address",
    ],
  },
  {
    id: "whatsapp",
    platform: null,
    name: "WhatsApp",
    logo: "/logos/whatsapp-logo.png",
    fullBleedLogo: true,
    description: "Get customer reply approvals and daily ticket summaries in WhatsApp chats.",
    connectType: null,
    channelKind: 'support',
    comingSoon: true,
  },
  {
    id: "instagram",
    platform: "ig_dm",
    name: "Instagram",
    logo: "/logos/instagram-logo.png",
    fullBleedLogo: true,
    description: "Manage direct messages with customer memory, cross-channel ticket linking, and business account replies.",
    connectType: 'ig',
    channelKind: 'support',
    permissions: [
      "Read Direct Messages sent to your business account",
      "Send replies from your business account",
      "View your business account profile",
    ],
  },
  {
    id: "imessage",
    platform: "imessage",
    name: "iMessage",
    logo: "/logos/sms.svg",
    logoSize: 30,
    description: "Text your store's agent from iMessage — order lookups, daily digests, and one-tap approvals.",
    connectType: 'imessage',
    channelKind: 'operator',
    permissions: [
      "Send instructions and approvals from your iPhone",
      "Receive order updates and ticket digests on iMessage",
    ],
  },
  {
    id: "telegram",
    platform: null,
    name: "Telegram",
    logo: "/logos/telegram.svg",
    fullBleedLogo: true,
    tileClass: "bg-[#229ED9]",
    description: "Approve agent replies and receive ticket digests via the Shopkeeper Telegram bot.",
    connectType: null,
    channelKind: 'operator',
  },
  {
    id: "email",
    platform: "email",
    emailProvider: "postmark",
    name: "Email",
    logo: null,
    tileClass: "bg-gradient-to-b from-[#5AB1F5] to-[#1D77EF]",
    description: "Route custom-domain support mail, forward incoming threads, and send replies from your verified address.",
    connectType: 'email',
    channelKind: 'support',
    permissions: [
      "Send replies from your verified address",
    ],
  },
  {
    id: "outlook",
    platform: "email",
    emailProvider: "outlook",
    name: "Outlook",
    logo: "/logos/outlook.svg",
    fullBleedLogo: true,
    description: "Route support mail, draft replies, and send responses from your Outlook inbox.",
    connectType: 'email',
    channelKind: 'support',
    permissions: [
      "Send replies from your Outlook address",
      "View your name and email address",
      "Stay signed in with offline access",
    ],
  },
]

export const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Connection cancelled.',
  no_ig_account: 'No Instagram Business account was found on your Facebook account.',
  token_exchange_failed: 'Authentication failed. Please try again.',
  state_mismatch: 'Security check failed. Please try again.',
  server_error: 'Something went wrong on our end. Please try again.',
  shopify_state_mismatch: 'Security check failed. Please try again.',
  shopify_hmac_invalid: 'Authentication failed. The response from Shopify could not be verified.',
  shopify_token_failed: 'Could not obtain a Shopify access token. Please try again.',
  shopify_server_error: 'Something went wrong connecting your Shopify store. Please try again.',
  shopify_invalid_callback: 'Invalid callback from Shopify. Please try again.',
  shopify_shop_mismatch: 'The Shopify store that authorized the app did not match the store you entered. Please try again.',
}
