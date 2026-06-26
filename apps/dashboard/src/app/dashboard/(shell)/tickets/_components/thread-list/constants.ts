import { getChannelInfo } from "@/lib/messaging/channels"
export { getTagStyle, getMeaningfulTagStyle } from "@/app/dashboard/_lib/ticket-tags"
import type { ChannelType } from "@/types"

export type TicketListView = "for_me" | "all_open" | "closed" | "spam"

export const TICKET_TAG_FILTERS = [
  "Shipping",
  "Returns",
  "Order Status",
  "Product Inquiry",
] as const

export type TicketTagFilter = typeof TICKET_TAG_FILTERS[number]

const FILTER_IDS: ChannelType[] = ["email", "ig_dm"]

export function buildChannelFilters(connectedChannels: ChannelType[]) {
  const ids = FILTER_IDS.filter(id => connectedChannels.includes(id))
  return ids.map(id => {
    const info = getChannelInfo(id)
    return { id, logo: info.logo, label: info.name }
  })
}

export function viewToConversationTab(view: TicketListView): "open" | "closed" {
  return view === "closed" ? "closed" : "open"
}

export function isOpenListView(view: TicketListView) {
  return view === "for_me" || view === "all_open"
}

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
