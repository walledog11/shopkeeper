import { channelDisplayName } from '@shopkeeper/agent/thread-constants'

import type { ChannelType } from '@/types'

export interface ChannelInfo {
  name: string
  label: string
  logo: string
  badgeClassName: string
}

interface ChannelLabelOptions {
  operatorLabel?: "canonical" | "internal"
}

const DEFAULT_CHANNEL_INFO: ChannelInfo = {
  name: 'Workspace',
  label: 'Workspace',
  logo: '/logos/default.svg',
  badgeClassName: 'bg-muted text-muted-foreground',
}

// Display names come from `@shopkeeper/agent` so the badge, the KB provenance
// line and the digest all call a channel the same thing. Only the chrome —
// logo and badge colour — is the dashboard's own.
const CHANNEL_CHROME: Record<ChannelType, Pick<ChannelInfo, 'logo' | 'badgeClassName'>> = {
  ig_dm: { logo: '/logos/instagram-outline.svg', badgeClassName: 'bg-pink-500/15 text-pink-600' },
  email: { logo: '/logos/email.svg', badgeClassName: 'bg-blue-500/15 text-blue-600' },
  tiktok: { logo: '/logos/tiktok-logo.png', badgeClassName: 'bg-slate-500/15 text-stone-600' },
  shopify: { logo: '/logos/shopify.svg', badgeClassName: 'bg-green-500/15 text-green-600' },
  shopify_chat: { logo: '/logos/shopify.svg', badgeClassName: 'bg-green-500/15 text-green-600' },
  imessage: { logo: '/logos/sms.svg', badgeClassName: 'bg-sky-500/15 text-sky-600' },
  sms: { logo: '/logos/sms.svg', badgeClassName: 'bg-emerald-500/15 text-emerald-600' },
  operator: { logo: '/logos/sms.svg', badgeClassName: 'bg-emerald-500/15 text-emerald-600' },
  dashboard_agent: { logo: '/logos/sms.svg', badgeClassName: 'bg-violet-500/15 text-violet-600' },
}

const CHANNEL_INFO: Record<ChannelType, ChannelInfo> = Object.fromEntries(
  (Object.keys(CHANNEL_CHROME) as ChannelType[]).map((channelType) => {
    const name = channelDisplayName(channelType, channelType)
    return [channelType, { name, label: name, ...CHANNEL_CHROME[channelType] }]
  }),
) as Record<ChannelType, ChannelInfo>

const EXTRA_CHANNEL_INFO: Record<string, ChannelInfo> = {
  whatsapp: {
    name: 'WhatsApp',
    label: 'WhatsApp',
    logo: '/logos/default.svg',
    badgeClassName: 'bg-muted text-muted-foreground',
  },
}

export function getChannelInfo(channelType: ChannelType | string | null | undefined): ChannelInfo {
  if (!channelType) return DEFAULT_CHANNEL_INFO
  return CHANNEL_INFO[channelType as ChannelType] ?? EXTRA_CHANNEL_INFO[channelType] ?? {
    ...DEFAULT_CHANNEL_INFO,
    name: channelType,
    label: channelType,
  }
}

export function getChannelInfoByName(channelName: string): ChannelInfo {
  for (const info of Object.values(CHANNEL_INFO)) {
    if (info.name === channelName) return info
  }
  for (const info of Object.values(EXTRA_CHANNEL_INFO)) {
    if (info.name === channelName) return info
  }
  return { ...DEFAULT_CHANNEL_INFO, name: channelName, label: channelName }
}

export function getActionLogChannelInfo(entry: {
  channelType: ChannelType | string | null | undefined
  instruction?: string | null
}): ChannelInfo {
  const instruction = entry.instruction?.trim()
  if (instruction?.startsWith('order-risk-review:')) {
    return getChannelInfo('shopify')
  }
  return getChannelInfo(entry.channelType)
}

export function getChannelLabel(
  channelType: ChannelType | string | null | undefined,
  { operatorLabel = "canonical" }: ChannelLabelOptions = {},
): string {
  if (operatorLabel === "internal" && (channelType === "dashboard_agent" || channelType === "operator")) {
    return "Internal"
  }
  return getChannelInfo(channelType).label
}

export function getChannelBadgeClassName(channelType: ChannelType | string | null | undefined): string {
  return getChannelInfo(channelType).badgeClassName
}
