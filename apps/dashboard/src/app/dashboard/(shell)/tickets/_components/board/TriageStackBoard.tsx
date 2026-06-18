"use client"

import { useMemo, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  groupTicketsByTriageTier,
  type TicketTriageTierGroup,
} from "../../_lib/group-tickets-by-triage-tier"
import type { TicketListView } from "../thread-list/constants"
import { TriageStackColumn } from "./TriageStackColumn"
import type { OrgSettings, Ticket } from "@/types"

const LIST_BY_DEFAULT_THRESHOLD = 6

interface TriageStackBoardProps {
  tickets: Ticket[]
  activeView: TicketListView
  agentName: string
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
  activeTicketId: string | null
  approvingTicketId: string | null
  onSelectTicket: (id: string) => void
  onQuickApprove: (id: string) => void
  onReview: (id: string) => void
}

function listByDefault(group: TicketTriageTierGroup): boolean {
  return group.collapsible && group.tickets.length > LIST_BY_DEFAULT_THRESHOLD
}

export function TriageStackBoard({
  tickets,
  activeView,
  agentName,
  hasShopify,
  orgSettings = null,
  activeTicketId,
  approvingTicketId,
  onSelectTicket,
  onQuickApprove,
  onReview,
}: TriageStackBoardProps) {
  const groups = useMemo(
    () => groupTicketsByTriageTier(tickets, { orgSettings, hasShopify, isMobile: false }),
    [tickets, orgSettings, hasShopify],
  )
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  const isListMode = (group: TicketTriageTierGroup) =>
    overrides[group.tier] ?? listByDefault(group)

  const toggleListMode = (group: TicketTriageTierGroup) => {
    const next = !isListMode(group)
    setOverrides(prev => ({ ...prev, [group.tier]: next }))
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
          <CheckCircle2 className="size-5 text-foreground/40" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="font-display-serif text-lg text-foreground">You&apos;re all caught up</h2>
          <p className="max-w-[230px] text-sm text-foreground/50">
            {agentName} will flag anything that needs your eye.
          </p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {groups.map(group => (
            <TriageStackColumn
              key={group.tier}
              group={group}
              listMode={isListMode(group)}
              onToggleListMode={() => toggleListMode(group)}
              activeView={activeView}
              hasShopify={hasShopify}
              orgSettings={orgSettings}
              activeTicketId={activeTicketId}
              approvingTicketId={approvingTicketId}
              onSelectTicket={onSelectTicket}
              onQuickApprove={onQuickApprove}
              onReview={onReview}
            />
          ))}
        </div>
      </div>
    </TooltipProvider>
  )
}
