export type ConnectType = 'email' | 'ig' | 'shopify' | 'twilio' | 'coming-soon'

export interface PlatformConfig {
  id: string
  platform: string | null
  name: string
  logo: string
  description: string
  connectType: ConnectType
  accentBg: string
  accentBorder: string
}

export const PLATFORM_CONFIG: PlatformConfig[] = [
  {
    id: "email",
    platform: "email",
    name: "Email",
    logo: "/logos/email.svg",
    description: "Route your support inbox directly into Clerk and reply from a verified sender address.",
    connectType: 'email',
    accentBg: "bg-blue-500/[0.08]",
    accentBorder: "border-blue-500/20",
  },
  {
    id: "instagram",
    platform: "ig_dm",
    name: "Instagram",
    logo: "/logos/instagram-logo.png",
    description: "Manage Direct Messages from your Instagram business account alongside every other channel.",
    connectType: 'ig',
    accentBg: "bg-pink-500/[0.08]",
    accentBorder: "border-pink-500/20",
  },
  {
    id: "tiktok",
    platform: "tiktok",
    name: "TikTok",
    logo: "/logos/tiktok-logo.png",
    description: "Manage TikTok Shop messages and video comments in one unified inbox.",
    connectType: 'coming-soon',
    accentBg: "bg-white/[0.05]",
    accentBorder: "border-white/[0.10]",
  },
  {
    id: "shopify",
    platform: "shopify",
    name: "Shopify",
    logo: "/logos/shopify.svg",
    description: "Sync customer orders, returns, and Shopify Inbox messages directly into Clerk.",
    connectType: 'shopify',
    accentBg: "bg-emerald-500/[0.08]",
    accentBorder: "border-emerald-500/20",
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
}
