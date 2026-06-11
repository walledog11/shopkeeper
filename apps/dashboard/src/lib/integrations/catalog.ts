export type ConnectType = 'email' | 'ig' | 'shopify'
export type EmailProviderFilter = 'gmail' | 'outlook' | 'postmark'

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
  comingSoon?: boolean
  permissions?: string[]
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
    permissions: [
      "Read Direct Messages sent to your business account",
      "Send replies from your business account",
      "View your business account profile",
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
