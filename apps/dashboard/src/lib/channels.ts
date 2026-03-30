import type { ChannelType } from '@/types'

const CHANNEL_INFO: Record<ChannelType, { name: string; logo: string }> = {
  ig_dm:     { name: 'Instagram',    logo: '/logos/instagram-logo.png' },
  email:     { name: 'Gmail',        logo: '/logos/gmail.png' },
  tiktok:    { name: 'TikTok',      logo: '/logos/tiktok-logo.png' },
  shopify:   { name: 'Shopify',      logo: '/logos/shopify.svg' },
  sms:       { name: 'SMS',          logo: '/logos/sms.svg' },
  sms_agent: { name: 'Agent Action', logo: '/logos/sms.svg' },
}

export function getChannelInfo(channelType: ChannelType): { name: string; logo: string } {
  return CHANNEL_INFO[channelType] ?? { name: channelType, logo: '/logos/default.png' }
}
