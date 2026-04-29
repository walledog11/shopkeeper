import { getChannelInfo } from "@/lib/messaging/channels"
export { getTagStyle } from "@/app/dashboard/_lib/ticket-tags"
import type { ChannelType } from "@/types"

export type TicketListTab = "open" | "closed" | "filtered"

export const FILTER_IDS: ChannelType[] = ["email", "ig_dm", "sms_agent"]

export const CHANNEL_FILTERS = FILTER_IDS.map(id => {
  const info = getChannelInfo(id)
  return { id, logo: info.logo, label: info.name }
})

const AVATAR_GRADIENTS = [
  "from-orange-400 to-rose-500",
  "from-sky-400 to-blue-600",
  "from-emerald-400 to-teal-600",
  "from-violet-400 to-purple-600",
  "from-pink-400 to-fuchsia-600",
  "from-amber-400 to-orange-500",
]

export function getAvatarGradient(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
