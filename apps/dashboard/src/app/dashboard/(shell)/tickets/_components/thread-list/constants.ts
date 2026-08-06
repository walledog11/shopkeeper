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

const FILTER_IDS: ChannelType[] = ["email", "ig_dm", "tiktok"]

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

export { customerInitials as getInitials } from "@/lib/messaging/customer-display"
