"use client"

import { useMemo } from "react"
import { threadToTicket } from "../_lib/thread-to-ticket"
import {
  buildTicketListPresentationFromTicket,
  compareTicketTriageTier,
} from "../_lib/ticket-list-presentation"
import type { TicketListView, TicketQueueTierFilter, TicketTagFilter } from "../_components/thread-list/constants"
import type { ChannelType, OrgSettings, Thread, Ticket } from "@/types"

export function useVisibleTicketList(input: {
  effectiveActiveView: TicketListView
  hasShopify: boolean
  isSearchMode: boolean
  listThreads: Thread[]
  orgSettings?: Partial<OrgSettings> | null
  tierFilter: TicketQueueTierFilter | null
  channelFilter: ChannelType | null
  tagFilter: TicketTagFilter | null
}): {
  filteredTickets: Ticket[]
  liveTickets: Ticket[]
} {
  const {
    effectiveActiveView,
    hasShopify,
    isSearchMode,
    listThreads,
    orgSettings,
    tierFilter,
    channelFilter,
    tagFilter,
  } = input

  const liveTickets: Ticket[] = useMemo(
    () => listThreads.map(t => threadToTicket(t)),
    [listThreads],
  )

  const filteredTickets = useMemo(() => {
    let tickets = [...liveTickets]

    if (!isSearchMode && channelFilter) {
      tickets = tickets.filter(ticket => ticket.channelType === channelFilter)
    }

    if (!isSearchMode && tagFilter) {
      tickets = tickets.filter(ticket => ticket.tag === tagFilter)
    }

    if (!isSearchMode && effectiveActiveView === "all_open" && tierFilter) {
      tickets = tickets.filter(ticket => {
        const { tier } = buildTicketListPresentationFromTicket(ticket, {
          orgSettings,
          hasShopify,
          listView: "all_open",
          activeTab: "open",
        })
        return tier === tierFilter
      })
    }

    if (!isSearchMode && effectiveActiveView === "for_me") {
      tickets.sort((left, right) => {
        const leftPresentation = buildTicketListPresentationFromTicket(left, {
          orgSettings,
          hasShopify,
          listView: "for_me",
          activeTab: "open",
        })
        const rightPresentation = buildTicketListPresentationFromTicket(right, {
          orgSettings,
          hasShopify,
          listView: "for_me",
          activeTab: "open",
        })
        const tierOrder = compareTicketTriageTier(leftPresentation.tier, rightPresentation.tier)
        if (tierOrder !== 0) return tierOrder
        return new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime()
      })
      return tickets
    }

    if (!isSearchMode) {
      tickets.sort(
        (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
      )
    }

    return tickets
  }, [channelFilter, effectiveActiveView, hasShopify, isSearchMode, liveTickets, orgSettings, tagFilter, tierFilter])

  return { filteredTickets, liveTickets }
}
