"use client"

import { useMemo, type Ref } from "react"
import Image from "next/image"
import { Ban, CheckSquare, RotateCcw, Square } from "lucide-react"
import { useIsMobile } from "@/hooks/useMobile"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import {
  buildTicketListPresentationFromTicket,
  type TicketListPresentation,
} from "../../_lib/ticket-list-presentation"
import { getSlaInfo } from "./sla"
import { getAvatarGradient, getInitials, isOpenListView, type TicketListView } from "./constants"
import { TicketRowActions } from "./TicketRowActions"
import { hasTicketRowListAction } from "./ticket-row-action-visibility"
import { TicketRowDesktopMeta } from "./TicketRowDesktopMeta"
import { TicketRowMobile } from "./TicketRowMobile"
import type { OrgSettings, Ticket } from "@/types"
import { useTicketRowSwipe, type TicketRowSwipeAction } from "./useTicketRowSwipe"

interface TicketRowProps {
  activeView: TicketListView
  activeTicketId: string | null
  approvingTicketId: string | null
  context: {
    hasShopify: boolean
    isSearchMode?: boolean
  }
  selection: {
    hasSelection: boolean
    isSelected: boolean
  }
  orgSettings?: Partial<OrgSettings> | null
  ticket: Ticket
  onQuickApproveFromList: (threadId: string) => void
  onReviewFromList: (threadId: string) => void
  onSelectTicket: (id: string) => void
  onToggleSelect: (id: string) => void
  onMarkAsSpam?: (id: string) => void
  onRecover?: (id: string) => void
}

type TicketRowAction = TicketRowSwipeAction

export function TicketRow({
  activeView,
  activeTicketId,
  approvingTicketId,
  context,
  selection,
  orgSettings = null,
  ticket,
  onQuickApproveFromList,
  onReviewFromList,
  onSelectTicket,
  onToggleSelect,
  onMarkAsSpam,
  onRecover,
}: TicketRowProps) {
  const { hasShopify, isSearchMode } = context
  const { hasSelection, isSelected } = selection
  const isMobile = useIsMobile()
  const lastRealMsg = [...ticket.messages].reverse().find(message => message.sender !== "note")
  const awaitingReply = ticket.status === "open" && lastRealMsg?.sender === "customer"
  const sla = awaitingReply ? getSlaInfo(ticket.lastCustomerMessageAt) : null
  const isActive = activeTicketId === ticket.id
  const closed = ticket.status === "closed" || activeView === "closed"
  const longWait = sla?.longWait ?? false
  const isSpam = ticket.filterStatus === "filtered"
  const useMobileLayout = isMobile && (isOpenListView(activeView) || isSearchMode)
  const isApproving = approvingTicketId === ticket.id
  const listActionsDisabled = approvingTicketId !== null && !isApproving

  const presentation = useMemo(
    () => buildTicketListPresentationFromTicket(ticket, {
      orgSettings,
      hasShopify,
      listView: activeView,
      isMobile,
      activeTab: activeView === "closed" ? "closed" : "open",
    }),
    [activeView, hasShopify, isMobile, orgSettings, ticket],
  )

  const showListActions = activeView === "for_me"
    && !hasSelection
    && !isSearchMode
    && !closed
    && hasTicketRowListAction(presentation)

  const isHoverCapable = useMediaQuery("(hover: hover) and (pointer: fine)")
  const useSwipe = isHoverCapable === false

  const recoverable = activeView === "spam" && !!onRecover
  const spammable = !closed && ticket.filterStatus !== "filtered" && !!onMarkAsSpam
  const rowAction: TicketRowAction | null = !hasSelection && !isSearchMode
    ? recoverable
      ? { kind: "recover" as const, run: () => onRecover!(ticket.id) }
      : spammable
        ? { kind: "spam" as const, run: () => onMarkAsSpam!(ticket.id) }
        : null
    : null

  const { bannerRef, canSwipe, openTicketRow, surfaceProps } = useTicketRowSwipe({
    enabled: useSwipe,
    action: rowAction,
    onOpen: () => onSelectTicket(ticket.id),
  })

  const gradient = getAvatarGradient(presentation.customerLabel)
  const initials = getInitials(presentation.customerLabel)
  const desktopTime = isSearchMode ? ticket.time : presentation.timeAgo

  const rowActions = showListActions ? (
    <TicketRowActions
      presentation={presentation}
      isApproving={isApproving}
      disabled={listActionsDisabled}
      onSend={() => { void onQuickApproveFromList(ticket.id) }}
      onReview={() => onReviewFromList(ticket.id)}
    />
  ) : null

  return (
    <div
      data-testid="ticket-row"
      data-ticket-id={ticket.id}
      data-ticket-channel={ticket.channelType}
      className="relative overflow-hidden"
    >
      {canSwipe && rowAction && <TicketRowSwipeBanner ref={bannerRef} kind={rowAction.kind} />}

      <div
        {...surfaceProps}
        className={`relative pt-0.5 ${canSwipe ? "bg-background select-none" : ""}`}
      >
        <div
          className={`cursor-pointer relative px-4 py-2 transition-colors group ${
            isActive ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.04]"
          }`}
        >
          <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full ${
            isActive ? "bg-green-400" : "bg-transparent"
          }`} />

          <button type="button"
            onClick={event => { event.stopPropagation(); onToggleSelect(ticket.id) }}
            className={`hidden md:block absolute left-3 top-1/2 -translate-y-1/2 transition-opacity z-10 ${
              hasSelection || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            {isSelected
              ? <CheckSquare className="size-3.5 text-foreground/70" />
              : <Square className="size-3.5 text-foreground/20" />
            }
          </button>

          <div
            className={`flex w-full items-stretch gap-2 transition-transform ${
              hasSelection ? "md:translate-x-5" : "md:group-hover:translate-x-5"
            }`}
          >
            <button
              type="button"
              data-testid="ticket-row-open"
              data-ticket-id={ticket.id}
              onClick={openTicketRow}
              className="flex flex-1 min-w-0 items-start gap-3 border-0 bg-transparent p-0 text-left [font-family:inherit]"
            >
              {useMobileLayout ? (
                <TicketRowMobile
                  ticket={ticket}
                  presentation={presentation}
                  longWait={longWait}
                  browseMode={activeView === "all_open"}
                />
              ) : (
                <TicketRowDesktopContent
                  ticket={ticket}
                  presentation={presentation}
                  avatar={{ gradient, initials }}
                  desktopTime={desktopTime}
                  flags={{
                    closed,
                    isSearchMode,
                    isSpam,
                    longWait,
                    showListActions,
                    showSlaStatus: !sla,
                    useSwipe,
                    hasHoverAction: rowAction !== null,
                  }}
                />
              )}
            </button>

            {showListActions && (
              <div className={`flex shrink-0 items-end pb-0.5 ${useMobileLayout ? "" : "absolute right-4 top-1/2 -translate-y-1/2"}`}>
                {rowActions}
              </div>
            )}
          </div>

          {!useSwipe && rowAction && !showListActions && (
            <TicketRowHoverAction action={rowAction} />
          )}

        </div>
      </div>
    </div>
  )
}

function TicketRowSwipeBanner({
  ref,
  kind,
}: {
  ref: Ref<HTMLDivElement>
  kind: TicketRowAction["kind"]
}) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{ visibility: "hidden" }}
      className={`absolute inset-0 flex items-center justify-end gap-2 pr-5 text-white text-sm font-semibold pointer-events-none ${
        kind === "spam" ? "bg-red-500/90" : "bg-emerald-500/90"
      }`}
    >
      {kind === "spam"
        ? <><Ban className="size-4" /> Spam</>
        : <><RotateCcw className="size-4" /> Recover</>
      }
    </div>
  )
}

interface TicketRowDesktopContentProps {
  ticket: Ticket
  presentation: TicketListPresentation
  avatar: {
    gradient: string
    initials: string
  }
  desktopTime: string
  flags: {
    closed: boolean
    hasHoverAction: boolean
    isSearchMode?: boolean
    isSpam: boolean
    longWait: boolean
    showListActions: boolean
    showSlaStatus: boolean
    useSwipe: boolean
  }
}

function TicketRowDesktopContent({
  ticket,
  presentation,
  avatar,
  desktopTime,
  flags,
}: TicketRowDesktopContentProps) {
  const showHoverTime = !flags.useSwipe && flags.hasHoverAction && !flags.showListActions

  return (
    <>
      <div className="relative size-9 shrink-0">
        <div className={`size-9 rounded-xl bg-gradient-to-br ${avatar.gradient} flex items-center justify-center text-white text-[14px] font-bold shadow-sm`}>
          {avatar.initials}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 size-4.5 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center">
          <Image src={ticket.logo} width={9} height={9} alt={ticket.platform} className="object-contain brightness-0 invert opacity-80" />
        </div>
      </div>

      <div className={`flex-1 min-w-0 ${flags.showListActions ? "pr-16" : ""}`}>
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className="text-sm font-semibold text-foreground/90 truncate">
            {presentation.customerLabel}
          </span>
          <div className="relative shrink-0 flex items-center justify-end min-h-[14px]">
            <span
              className={`text-xs transition-opacity ${flags.longWait ? "text-foreground/55 font-medium" : "text-foreground/30"} ${
                showHoverTime ? "group-hover:opacity-0" : ""
              }`}
            >
              {desktopTime}
            </span>
          </div>
        </div>

        {presentation.showSubject && (
          <p className="text-[13px] font-medium text-foreground/80 truncate mb-0.5">{ticket.subject}</p>
        )}

        {flags.isSpam && ticket.filterReason ? (
          <p className="text-xs text-foreground/45 line-clamp-2 mb-2">{ticket.filterReason}</p>
        ) : presentation.subline ? (
          <p className="text-xs text-foreground/40 line-clamp-1 mb-2">{presentation.subline}</p>
        ) : (
          <p className="text-xs text-foreground/40 line-clamp-1 mb-2">{ticket.preview}</p>
        )}

        <TicketRowDesktopMeta
          presentation={presentation}
          ticket={ticket}
          isSpam={flags.isSpam}
          closed={flags.closed}
          isSearchMode={flags.isSearchMode}
          showSlaStatus={flags.showSlaStatus}
        />
      </div>
    </>
  )
}

function TicketRowHoverAction({ action }: { action: TicketRowAction }) {
  return (
    <button
      type="button"
      onClick={event => { event.stopPropagation(); action.run() }}
      title={action.kind === "spam" ? "Mark as spam" : "Recover to inbox"}
      className={`absolute right-4 top-3 flex items-center justify-end opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity ${
        action.kind === "spam" ? "text-foreground/50 hover:text-red-400" : "text-foreground/50 hover:text-emerald-400"
      }`}
    >
      {action.kind === "spam"
        ? <Ban className="size-3.5" />
        : <RotateCcw className="size-3.5" />
      }
    </button>
  )
}
