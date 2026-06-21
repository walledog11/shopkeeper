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

const CHANNEL_INFO: Record<ChannelType, ChannelInfo> = {
  ig_dm: {
    name: 'Instagram',
    label: 'Instagram',
    logo: '/logos/instagram-outline.svg',
    badgeClassName: 'bg-pink-500/15 text-pink-400',
  },
  email: {
    name: 'Email',
    label: 'Email',
    logo: '/logos/email.svg',
    badgeClassName: 'bg-blue-500/15 text-blue-400',
  },
  tiktok: {
    name: 'TikTok',
    label: 'TikTok',
    logo: '/logos/tiktok-logo.png',
    badgeClassName: 'bg-slate-500/15 text-slate-400',
  },
  shopify: {
    name: 'Shopify',
    label: 'Shopify',
    logo: '/logos/shopify.svg',
    badgeClassName: 'bg-green-500/15 text-green-400',
  },
  imessage: {
    name: 'iMessage',
    label: 'iMessage',
    logo: '/logos/sms.svg',
    badgeClassName: 'bg-sky-500/15 text-sky-400',
  },
  sms: {
    name: 'SMS',
    label: 'SMS',
    logo: '/logos/sms.svg',
    badgeClassName: 'bg-emerald-500/15 text-emerald-400',
  },
  sms_agent: {
    name: 'Telegram',
    label: 'Telegram',
    logo: '/logos/sms.svg',
    badgeClassName: 'bg-emerald-500/15 text-emerald-400',
  },
  dashboard_agent: {
    name: 'Dashboard',
    label: 'Dashboard',
    logo: '/logos/sms.svg',
    badgeClassName: 'bg-violet-500/15 text-violet-400',
  },
}

const EXTRA_CHANNEL_INFO: Record<string, ChannelInfo> = {
  whatsapp: {
    name: 'WhatsApp',
    label: 'WhatsApp',
    logo: '/logos/default.svg',
    badgeClassName: 'bg-muted text-muted-foreground',
  },
}

export const DASHBOARD_CHANNEL_TYPES = [
  'email',
  'ig_dm',
  'imessage',
  'sms',
  'shopify',
  'tiktok',
  'dashboard_agent',
  'sms_agent',
] as const satisfies readonly ChannelType[]

export function getChannelInfo(channelType: ChannelType | string | null | undefined): ChannelInfo {
  if (!channelType) return DEFAULT_CHANNEL_INFO
  return CHANNEL_INFO[channelType as ChannelType] ?? EXTRA_CHANNEL_INFO[channelType] ?? {
    ...DEFAULT_CHANNEL_INFO,
    name: channelType,
    label: channelType,
  }
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
  if (operatorLabel === "internal" && (channelType === "dashboard_agent" || channelType === "sms_agent")) {
    return "Internal"
  }
  return getChannelInfo(channelType).label
}

export function getChannelBadgeClassName(channelType: ChannelType | string | null | undefined): string {
  return getChannelInfo(channelType).badgeClassName
}

export function getChannelOptions(
  channelTypes: readonly ChannelType[] = DASHBOARD_CHANNEL_TYPES,
): { id: ChannelType; label: string }[] {
  return channelTypes.map(id => ({ id, label: getChannelLabel(id) }))
}
