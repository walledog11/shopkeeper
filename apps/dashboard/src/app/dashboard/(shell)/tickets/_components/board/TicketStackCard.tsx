"use client"

import { useMemo } from "react"
import Image from "next/image"
import { buildTicketListPresentationFromTicket } from "../../_lib/ticket-list-presentation"
import { getAvatarGradient, getInitials } from "../thread-list/constants"
import { TicketTagPill } from "../thread-list/ticket-tag-pill"
import { TicketRowActions } from "../thread-list/TicketRowActions"
import { hasTicketRowListAction } from "../thread-list/ticket-row-action-visibility"
import { TicketRowStatusPill } from "../thread-list/ticket-row-status-pill"
import type { TicketListView } from "../thread-list/constants"
import type { OrgSettings, Ticket } from "@/types"

interface TicketStackCardProps {
  ticket: Ticket
  activeView: TicketListView
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
  isActive: boolean
  isApproving: boolean
  actionsDisabled: boolean
  onOpen: () => void
  onSend: () => void
  onReview: () => void
}

export function TicketStackCard({
  ticket,
  activeView,
  hasShopify,
  orgSettings = null,
  isActive,
  isApproving,
  actionsDisabled,
  onOpen,
  onSend,
  onReview,
}: TicketStackCardProps) {
  const presentation = useMemo(
    () => buildTicketListPresentationFromTicket(ticket, {
      orgSettings,
      hasShopify,
      listView: activeView,
      activeTab: activeView === "closed" ? "closed" : "open",
    }),
    [activeView, hasShopify, orgSettings, ticket],
  )

  const gradient = getAvatarGradient(presentation.customerLabel)
  const initials = getInitials(presentation.customerLabel)
  const showActions = hasTicketRowListAction(presentation)
  const title = presentation.headline && presentation.headline !== ticket.tag
    ? presentation.headline
    : ticket.subject
  const preview = presentation.subline || ticket.preview

  return (
    <div
      className={`flex h-72 flex-col gap-3 rounded-3xl border bg-card px-5 py-5 shadow-sm transition-colors ${
        isActive ? "border-foreground/30" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="relative size-9 shrink-0">
          <div className={`size-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-[#ffffff] text-[14px] font-bold shadow-sm`}>
            {initials}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 size-4.5 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center">
            <Image src={ticket.logo} width={9} height={9} alt={ticket.platform} className="object-contain brightness-0 invert opacity-80" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-strong">{presentation.customerLabel}</span>
            <span className="shrink-0 text-xs tabular-nums text-faint">{presentation.timeAgo}</span>
          </div>
          <span className="block text-xs text-faint">{presentation.channelName}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-2 border-0 bg-transparent p-0 text-left [font-family:inherit]"
      >
        <TicketTagPill tag={ticket.tag} className="w-fit" />
        <h3 className="font-sans text-lg font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
          {title}
        </h3>
        {preview && (
          <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{preview}</p>
        )}
      </button>

      <div className="mt-1 flex items-center justify-between gap-2">
        <TicketRowStatusPill label={presentation.primaryStatus.label} tone={presentation.primaryStatus.tone} />
        {showActions && (
          <TicketRowActions
            presentation={presentation}
            isApproving={isApproving}
            disabled={actionsDisabled}
            onSend={onSend}
            onReview={onReview}
          />
        )}
      </div>
    </div>
  )
}
