import type { OrgSettings, Ticket } from "@/types"
import {
  buildTicketListPresentationFromTicket,
  type TicketTriageTier,
} from "./ticket-list-presentation"

export const FOR_ME_TIER_SECTIONS: readonly TicketTriageTier[] = [
  "approve",
  "review",
  "waiting",
  "noise",
]

export const TRIAGE_TIER_SECTION_LABELS: Record<TicketTriageTier, string> = {
  approve: "Needs your OK",
  review: "Needs review",
  waiting: "Waiting on agent",
  noise: "Likely spam",
  closed: "Closed",
}

const COLLAPSIBLE_TIERS = new Set<TicketTriageTier>(["waiting", "noise"])

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
}

export function groupTicketsByTriageTier(
  tickets: Ticket[],
  options: GroupTicketsByTriageTierOptions,
): TicketTriageTierGroup[] {
  const buckets = new Map<TicketTriageTier, Ticket[]>()

  for (const ticket of tickets) {
    const { tier } = buildTicketListPresentationFromTicket(ticket, {
      orgSettings: options.orgSettings,
      hasShopify: options.hasShopify ?? true,
      listView: "for_me",
      isMobile: options.isMobile ?? true,
      activeTab: "open",
    })
    if (!FOR_ME_TIER_SECTIONS.includes(tier)) continue
    const list = buckets.get(tier) ?? []
    list.push(ticket)
    buckets.set(tier, list)
  }

  return FOR_ME_TIER_SECTIONS
    .filter(tier => (buckets.get(tier)?.length ?? 0) > 0)
    .map(tier => {
      const tierTickets = [...(buckets.get(tier) ?? [])]
      tierTickets.sort(
        (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
      )
      const collapsible = COLLAPSIBLE_TIERS.has(tier)
      return {
        tier,
        label: TRIAGE_TIER_SECTION_LABELS[tier],
        tickets: tierTickets,
        collapsible,
        defaultExpanded: !collapsible,
      }
    })
}
