"use client"

import { useMemo } from "react"
import { threadToTicket } from "../_lib/thread-to-ticket"
import {
  buildTicketListPresentationFromTicket,
  compareTicketTriageTier,
} from "../_lib/ticket-list-presentation"
import type { TicketListView } from "../_components/thread-list/constants"
import type { OrgSettings, Thread, Ticket } from "@/types"

export function useVisibleTicketList(input: {
  agentName: string
  effectiveActiveView: TicketListView
  hasShopify: boolean
  isSearchMode: boolean
  listThreads: Thread[]
  orgSettings?: Partial<OrgSettings> | null
}): {
  filteredTickets: Ticket[]
  liveTickets: Ticket[]
} {
  const {
    agentName,
    effectiveActiveView,
    hasShopify,
    isSearchMode,
    listThreads,
    orgSettings,
  } = input

  const liveTickets: Ticket[] = useMemo(
    () => listThreads.map(t => threadToTicket(t, agentName)),
    [listThreads, agentName],
  )

  const filteredTickets = useMemo(() => {
    const tickets = [...liveTickets]

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
  }, [effectiveActiveView, hasShopify, isSearchMode, liveTickets, orgSettings])

  return { filteredTickets, liveTickets }
}
