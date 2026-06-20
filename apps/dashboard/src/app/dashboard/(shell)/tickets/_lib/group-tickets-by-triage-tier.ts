import type { OrgSettings, Ticket } from "@/types"
import {
  buildTicketListPresentationFromTicket,
  type TicketTriageTier,
} from "./ticket-list-presentation"

export const NEEDS_YOU_TIER_SECTIONS: readonly TicketTriageTier[] = [
  "answer",
  "review",
  "ready",
  "working",
  "noise",
]

export const ALL_OPEN_TIER_SECTIONS: readonly TicketTriageTier[] = [
  ...NEEDS_YOU_TIER_SECTIONS,
  "waiting_customer",
]

const CLOSED_TIER_SECTIONS: readonly TicketTriageTier[] = ["closed"]

export const TRIAGE_TIER_SECTION_LABELS: Record<TicketTriageTier, string> = {
  answer: "Needs your answer",
  review: "Needs review",
  ready: "Ready to send",
  working: "Agent working",
  noise: "Possible spam",
  waiting_customer: "Waiting on customer",
  closed: "Closed",
}

const COLLAPSIBLE_TIERS = new Set<TicketTriageTier>(["working", "noise", "waiting_customer"])

export interface TicketTriageTierGroup {
  tier: TicketTriageTier
  label: string
  tickets: Ticket[]
  collapsible: boolean
  defaultExpanded: boolean
}

export interface GroupTicketsByTriageTierOptions {
  orgSettings?: Partial<OrgSettings> | null
  hasShopify?: boolean
  isMobile?: boolean
  listView?: "for_me" | "all_open" | "closed" | "spam"
  activeTab?: "open" | "closed"
}

export function groupTicketsByTriageTier(
  tickets: Ticket[],
  options: GroupTicketsByTriageTierOptions,
): TicketTriageTierGroup[] {
  const buckets = new Map<TicketTriageTier, Ticket[]>()
  const activeTab = options.activeTab ?? (options.listView === "closed" ? "closed" : "open")
  const sectionOrder = activeTab === "closed"
    ? CLOSED_TIER_SECTIONS
    : options.listView === "all_open"
      ? ALL_OPEN_TIER_SECTIONS
      : NEEDS_YOU_TIER_SECTIONS
  const sectionSet = new Set(sectionOrder)

  for (const ticket of tickets) {
    const { tier } = buildTicketListPresentationFromTicket(ticket, {
      orgSettings: options.orgSettings,
      hasShopify: options.hasShopify ?? true,
      listView: options.listView ?? "for_me",
      isMobile: options.isMobile ?? true,
      activeTab,
    })
    if (!sectionSet.has(tier)) continue
    const list = buckets.get(tier) ?? []
    list.push(ticket)
    buckets.set(tier, list)
  }

  return sectionOrder.reduce<TicketTriageTierGroup[]>((groups, tier) => {
    const ticketsInTier = buckets.get(tier)
    if (!ticketsInTier || ticketsInTier.length === 0) return groups

    const tierTickets = [...ticketsInTier]
    tierTickets.sort(
      (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
    )
    const collapsible = COLLAPSIBLE_TIERS.has(tier)
    groups.push({
      tier,
      label: TRIAGE_TIER_SECTION_LABELS[tier],
      tickets: tierTickets,
      collapsible,
      defaultExpanded: !collapsible,
    })
    return groups
  }, [])
}
