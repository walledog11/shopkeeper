"use client"

import { useReducer } from "react"
import type { ChannelType } from "@/types"
import type { TicketListView, TicketQueueTierFilter, TicketTagFilter } from "./thread-list/constants"

interface TicketsPageState {
  activeView: TicketListView
  channelFilter: ChannelType | null
  dismissCorrectHint: boolean
  searchQuery: string
  tagFilter: TicketTagFilter | null
  tierFilter: TicketQueueTierFilter | null
}

export type TicketsPageAction =
  | { type: "channelFilterChanged"; channelFilter: ChannelType | null }
  | { type: "correctHintDismissed" }
  | { type: "quietTierBrowsed"; tier: TicketQueueTierFilter }
  | { type: "searchChanged"; searchQuery: string }
  | { type: "tagFilterChanged"; tagFilter: TicketTagFilter | null }
  | { type: "tierFilterChanged"; tierFilter: TicketQueueTierFilter | null }
  | { type: "viewChanged"; view: TicketListView }

const VALID_VIEWS = new Set<TicketListView>(["for_me", "all_open", "closed", "spam"])

export function parseInitialTicketListView(viewParam: string | null): TicketListView {
  if (viewParam && VALID_VIEWS.has(viewParam as TicketListView)) {
    return viewParam as TicketListView
  }
  return "for_me"
}

const INITIAL_TICKETS_PAGE_STATE: TicketsPageState = {
  activeView: "for_me",
  channelFilter: null,
  dismissCorrectHint: false,
  searchQuery: "",
  tagFilter: null,
  tierFilter: null,
}

function ticketsPageReducer(state: TicketsPageState, action: TicketsPageAction): TicketsPageState {
  switch (action.type) {
    case "channelFilterChanged":
      return { ...state, channelFilter: action.channelFilter }
    case "correctHintDismissed":
      return { ...state, dismissCorrectHint: true }
    case "quietTierBrowsed":
      return {
        ...state,
        activeView: "all_open",
        searchQuery: "",
        tierFilter: action.tier,
      }
    case "searchChanged":
      return { ...state, searchQuery: action.searchQuery }
    case "tagFilterChanged":
      return { ...state, tagFilter: action.tagFilter }
    case "tierFilterChanged":
      return { ...state, tierFilter: action.tierFilter }
    case "viewChanged":
      return {
        ...state,
        activeView: action.view,
        searchQuery: "",
        tierFilter: null,
      }
  }
}

export function useTicketsPageState(initialView: TicketListView) {
  return useReducer(
    ticketsPageReducer,
    { ...INITIAL_TICKETS_PAGE_STATE, activeView: initialView },
  )
}
