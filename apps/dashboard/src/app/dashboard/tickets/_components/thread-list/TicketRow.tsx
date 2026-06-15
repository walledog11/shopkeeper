"use client"

import { useEffect, useMemo, useRef } from "react"
import Image from "next/image"
import { Ban, CheckSquare, RotateCcw, Square } from "lucide-react"
import { useIsMobile } from "@/hooks/useMobile"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { buildTicketListPresentationFromTicket } from "../../_lib/ticket-list-presentation"
import { getSlaInfo } from "./sla"
import { getAvatarGradient, getInitials, isOpenListView, type TicketListView } from "./constants"
import { hasTicketRowListAction, TicketRowActions } from "./TicketRowActions"
import { TicketRowMobile } from "./TicketRowMobile"
import { TicketRowStatusPill } from "./ticket-row-status-pill"
import type { OrgSettings, Ticket } from "@/types"

interface TicketRowProps {
  activeView: TicketListView
  activeTicketId: string | null
  approvingTicketId: string | null
  hasSelection: boolean
  hasShopify: boolean
  isSearchMode?: boolean
  isSelected: boolean
  orgSettings?: Partial<OrgSettings> | null
  ticket: Ticket
  onQuickApproveFromList: (threadId: string) => void
  onReviewFromList: (threadId: string) => void
  onSelectTicket: (id: string) => void
  onToggleSelect: (id: string) => void
  onMarkAsSpam?: (id: string) => void
  onRecover?: (id: string) => void
}

const SWIPE_DETECT_PX = 8
const SWIPE_COMMIT_PX = 120
const CLICK_SUPPRESS_PX = 6

export function TicketRow({
  activeView,
  activeTicketId,
  approvingTicketId,
  hasSelection,
  hasShopify,
  isSearchMode,
  isSelected,
  orgSettings = null,
  ticket,
  onQuickApproveFromList,
  onReviewFromList,
  onSelectTicket,
  onToggleSelect,
  onMarkAsSpam,
  onRecover,
}: TicketRowProps) {
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
  const rowAction = !hasSelection && !isSearchMode
    ? recoverable
      ? { kind: "recover" as const, run: () => onRecover!(ticket.id) }
      : spammable
        ? { kind: "spam" as const, run: () => onMarkAsSpam!(ticket.id) }
        : null
    : null

  const surfaceRef = useRef<HTMLDivElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const swipe = useRef({
    pointerId: -1, startX: 0, startY: 0, dx: 0,
    locked: false, width: 0, suppressClick: false, committed: false,
  })
  const commitTimeout = useRef<number | null>(null)
  const settleTimeout = useRef<number | null>(null)

  const canSwipe = useSwipe && rowAction !== null

  useEffect(() => () => {
    if (commitTimeout.current !== null) window.clearTimeout(commitTimeout.current)
    if (settleTimeout.current !== null) window.clearTimeout(settleTimeout.current)
  }, [])

  function applyTransform(tx: number, animate: boolean) {
    const el = surfaceRef.current
    if (!el) return
    el.style.transition = animate ? "transform 180ms ease" : "none"
    el.style.transform = tx === 0 ? "" : `translate3d(${tx}px,0,0)`
  }

  function setBannerVisible(visible: boolean) {
    const el = bannerRef.current
    if (!el) return
    el.style.visibility = visible ? "visible" : "hidden"
  }

  function setSurfacePromoted(promoted: boolean) {
    const el = surfaceRef.current
    if (!el) return
    el.style.willChange = promoted ? "transform" : ""
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!canSwipe) return
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (swipe.current.pointerId !== -1) return
    if (swipe.current.committed) return
    if (settleTimeout.current !== null) {
      window.clearTimeout(settleTimeout.current)
      settleTimeout.current = null
    }
    swipe.current = {
      pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      dx: 0, locked: false,
      width: event.currentTarget.getBoundingClientRect().width,
      suppressClick: false, committed: false,
    }
    setSurfacePromoted(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const s = swipe.current
    if (s.pointerId !== event.pointerId) return
    const dx = event.clientX - s.startX
    const dy = event.clientY - s.startY
    if (!s.locked) {
      if (Math.abs(dx) < SWIPE_DETECT_PX && Math.abs(dy) < SWIPE_DETECT_PX) return
      if (Math.abs(dy) > Math.abs(dx)) {
        s.pointerId = -1
        setSurfacePromoted(false)
        return
      }
      s.locked = true
      setBannerVisible(true)
    }
    s.dx = Math.min(0, dx)
    if (Math.abs(s.dx) > CLICK_SUPPRESS_PX) s.suppressClick = true
    applyTransform(s.dx, false)
  }

  function finish(event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const s = swipe.current
    if (s.pointerId !== event.pointerId) return
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    s.pointerId = -1
    const commitPx = Math.min(SWIPE_COMMIT_PX, s.width * 0.4)
    if (!cancelled && s.locked && rowAction && s.dx <= -commitPx) {
      s.committed = true
      applyTransform(-s.width, true)
      commitTimeout.current = window.setTimeout(() => {
        commitTimeout.current = null
        rowAction.run()
      }, 180)
    } else {
      applyTransform(0, true)
      const wasLocked = s.locked
      s.locked = false
      settleTimeout.current = window.setTimeout(() => {
        settleTimeout.current = null
        if (swipe.current.pointerId !== -1 || swipe.current.committed) return
        if (wasLocked) setBannerVisible(false)
        setSurfacePromoted(false)
      }, 200)
    }
  }

  function openTicketRow(event: React.MouseEvent) {
    if (swipe.current.suppressClick || swipe.current.committed) {
      swipe.current.suppressClick = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onSelectTicket(ticket.id)
  }

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
      {canSwipe && rowAction && (
        <div
          ref={bannerRef}
          aria-hidden="true"
          style={{ visibility: "hidden" }}
          className={`absolute inset-0 flex items-center justify-end gap-2 pr-5 text-white text-sm font-semibold pointer-events-none ${
            rowAction.kind === "spam" ? "bg-red-500/90" : "bg-emerald-500/90"
          }`}
        >
          {rowAction.kind === "spam"
            ? <><Ban className="size-4" /> Spam</>
            : <><RotateCcw className="size-4" /> Recover</>
          }
        </div>
      )}

      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={event => finish(event, false)}
        onPointerCancel={event => finish(event, true)}
        style={canSwipe ? { touchAction: "pan-y" } : undefined}
        className={`relative pt-0.5 ${canSwipe ? "bg-background select-none" : ""}`}
      >
        <div
          className={`cursor-pointer relative px-4 py-2 transition-colors group ${
            isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
          }`}
        >
          <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full ${
            isActive ? "bg-green-400" : "bg-transparent"
          }`} />

          <button type="button"
            onClick={event => { event.stopPropagation(); onToggleSelect(ticket.id) }}
            className={`absolute left-3 top-1/2 -translate-y-1/2 transition-opacity z-10 ${
              hasSelection || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            {isSelected
              ? <CheckSquare className="size-3.5 text-white/70" />
              : <Square className="size-3.5 text-white/20" />
            }
          </button>

          <div
            className={`flex w-full items-stretch gap-2 transition-transform ${hasSelection ? "translate-x-5" : "group-hover:translate-x-5"}`}
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
                />
              ) : (
                <>
                  <div className="relative size-9 shrink-0">
                    <div className={`size-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[14px] font-bold shadow-sm`}>
                      {initials}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 size-4.5 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                      <Image src={ticket.logo} width={9} height={9} alt={ticket.platform} className="object-contain brightness-0 invert opacity-80" />
                    </div>
                  </div>

                  <div className={`flex-1 min-w-0 ${showListActions ? "pr-16" : ""}`}>
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-white/90 truncate">
                        {presentation.customerLabel}
                      </span>
                      <div className="relative shrink-0 flex items-center justify-end min-h-[14px]">
                        <span
                          className={`text-xs transition-opacity ${longWait ? "text-foreground/55 font-medium" : "text-foreground/30"} ${
                            !useSwipe && rowAction && !showListActions ? "group-hover:opacity-0" : ""
                          }`}
                        >
                          {desktopTime}
                        </span>
                      </div>
                    </div>

                    {presentation.showSubject && (
                      <p className="text-[13px] font-medium text-white/80 truncate mb-0.5">{ticket.subject}</p>
                    )}

                    {isSpam && ticket.filterReason ? (
                      <p className="text-xs text-white/45 line-clamp-2 mb-2">{ticket.filterReason}</p>
                    ) : presentation.subline ? (
                      <p className="text-xs text-white/40 line-clamp-1 mb-2">{presentation.subline}</p>
                    ) : (
                      <p className="text-xs text-white/40 line-clamp-1 mb-2">{ticket.preview}</p>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      {isSpam ? (
                        <TicketRowStatusPill label="Spam" tone="danger" />
                      ) : (
                        <>
                          <TicketRowStatusPill
                            label={presentation.primaryStatus.label}
                            tone={presentation.primaryStatus.tone}
                          />
                          {!sla && isSearchMode && ticket.status && !closed && (
                            <span className="text-xs text-white/25 font-medium capitalize ml-auto">{ticket.status}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </button>

            {showListActions && (
              <div className={`flex shrink-0 items-end pb-0.5 ${useMobileLayout ? "" : "absolute right-4 top-1/2 -translate-y-1/2"}`}>
                {rowActions}
              </div>
            )}
          </div>

          {!useSwipe && rowAction && !showListActions && (
            <button type="button"
              onClick={event => { event.stopPropagation(); rowAction.run() }}
              title={rowAction.kind === "spam" ? "Mark as spam" : "Recover to inbox"}
              className={`absolute right-4 top-3 flex items-center justify-end opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity ${
                rowAction.kind === "spam" ? "text-white/50 hover:text-red-400" : "text-white/50 hover:text-emerald-400"
              }`}
            >
              {rowAction.kind === "spam"
                ? <Ban className="size-3.5" />
                : <RotateCcw className="size-3.5" />
              }
            </button>
          )}

        </div>
      </div>
    </div>
  )
}
