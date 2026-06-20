"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { LazyMotion, domMax, m, useMotionValue, useTransform } from "motion/react"
import { FLY_OFF, STACK_DEPTH, STACK_MARGIN_TOP } from "@/app/dashboard/_components/home/needs-you-motion"
import { SwipeCard, type SwipeCardHandle } from "@/app/dashboard/_components/home/NeedsYouSwipeCard"
import { TicketStackCard } from "./TicketStackCard"
import type { TicketListView } from "../thread-list/constants"
import type { OrgSettings, Ticket } from "@/types"

interface TicketStackDeckProps {
  tickets: Ticket[]
  activeView: TicketListView
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
  activeTicketId: string | null
  approvingTicketId: string | null
  onSelectTicket: (id: string) => void
  onQuickApprove: (id: string) => void
  onReview: (id: string) => void
}

interface TicketStackDeckState {
  activeTicketId: string | null
  currentId: string | null
  ticketIdsKey: string
}

export function TicketStackDeck({
  tickets,
  activeView,
  hasShopify,
  orgSettings = null,
  activeTicketId,
  approvingTicketId,
  onSelectTicket,
  onQuickApprove,
  onReview,
}: TicketStackDeckProps) {
  const ticketIdsKey = tickets.map(ticket => ticket.id).join("|")
  const initialCurrentId = activeTicketId && tickets.some(ticket => ticket.id === activeTicketId)
    ? activeTicketId
    : tickets.length > 0 ? tickets[0].id : null
  const [currentState, setCurrentState] = useState<TicketStackDeckState>(() => ({
    activeTicketId,
    currentId: initialCurrentId,
    ticketIdsKey,
  }))
  const [peekDirection, setPeekDirection] = useState<1 | -1>(1)
  const [frontHeight, setFrontHeight] = useState(0)
  const frontCardRef = useRef<HTMLDivElement>(null)
  const swipeRef = useRef<SwipeCardHandle>(null)
  const stackDragX = useMotionValue(0)
  const peekProgress = useTransform(stackDragX, value => Math.min(Math.abs(value) / FLY_OFF, 1))
  const peekX = useTransform(peekProgress, progress => -STACK_DEPTH.x * (1 - progress))
  const peekY = useTransform(peekProgress, progress => -STACK_DEPTH.y * (1 - progress))
  const peekRotate = useTransform(peekProgress, progress => -STACK_DEPTH.rotate * (1 - progress))
  const peekScale = useTransform(peekProgress, progress => 1 - STACK_DEPTH.scale * (1 - progress))
  const peekOpacity = useTransform(peekProgress, progress => (1 - STACK_DEPTH.opacity) + STACK_DEPTH.opacity * progress)
  const secondPeekX = useTransform(peekProgress, progress => -STACK_DEPTH.x * 2 * (1 - progress * 0.55))
  const secondPeekY = useTransform(peekProgress, progress => -STACK_DEPTH.y * 2 * (1 - progress * 0.55))
  const secondPeekRotate = useTransform(peekProgress, progress => -STACK_DEPTH.rotate * 2 * (1 - progress * 0.55))
  const secondPeekScale = useTransform(peekProgress, progress => 1 - STACK_DEPTH.scale * 2 * (1 - progress * 0.55))
  const secondPeekOpacity = useTransform(peekProgress, progress => (1 - STACK_DEPTH.opacity * 2) + STACK_DEPTH.opacity * progress)

  const activeTicketIsInDeck = Boolean(activeTicketId && tickets.some(ticket => ticket.id === activeTicketId))
  const currentId = currentState.currentId

  const n = tickets.length
  const mod = (value: number) => ((value % n) + n) % n
  const activeIndex = n > 0 ? Math.max(0, tickets.findIndex(ticket => ticket.id === currentId)) : 0
  const current = n > 0 ? tickets[activeIndex] : null
  const peekItem = n > 1 ? tickets[mod(activeIndex + peekDirection)] : null
  const isCurrentActive = Boolean(current && activeTicketId === current.id)

  useEffect(() => {
    setCurrentState(previous => {
      if (previous.activeTicketId === activeTicketId && previous.ticketIdsKey === ticketIdsKey) {
        return previous
      }

      const previousCurrentIsInDeck = Boolean(
        previous.currentId && tickets.some(ticket => ticket.id === previous.currentId),
      )
      const nextCurrentId = activeTicketIsInDeck
        ? activeTicketId
        : previousCurrentIsInDeck
          ? previous.currentId
          : tickets.length > 0 ? tickets[0].id : null

      return { activeTicketId, currentId: nextCurrentId, ticketIdsKey }
    })
  }, [activeTicketId, activeTicketIsInDeck, ticketIdsKey, tickets])

  useEffect(() => {
    const unsubscribe = stackDragX.on("change", value => {
      if (Math.abs(value) < 1) return

      const nextDirection = value < 0 ? 1 : -1
      setPeekDirection(previous => previous === nextDirection ? previous : nextDirection)
    })
    return () => unsubscribe()
  }, [stackDragX])

  useLayoutEffect(() => {
    stackDragX.set(0)
  }, [current?.id, stackDragX])

  useLayoutEffect(() => {
    const node = frontCardRef.current
    if (!node) return
    const updateHeight = () => setFrontHeight(node.offsetHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)
    return () => observer.disconnect()
  }, [current?.id])

  if (n === 0 || !current) return null

  const cardFor = (ticket: Ticket, isPeek: boolean) => {
    const cardIsActive = !isPeek && activeTicketId === ticket.id

    return (
    <TicketStackCard
      ticket={ticket}
      activeView={activeView}
      hasShopify={hasShopify}
      orgSettings={orgSettings}
      isActive={cardIsActive}
      isApproving={!isPeek && approvingTicketId === ticket.id}
      actionsDisabled={approvingTicketId !== null && approvingTicketId !== ticket.id}
      onOpen={() => onSelectTicket(ticket.id)}
      onSend={() => onQuickApprove(ticket.id)}
      onReview={() => onReview(ticket.id)}
    />
    )
  }

  if (n === 1) {
    return <div>{cardFor(current, false)}</div>
  }

  const commitNeighbor = (delta: 1 | -1) => {
    setPeekDirection(delta)
    const nextCurrentId = tickets[mod(activeIndex + delta)].id
    setCurrentState(previous => ({ ...previous, currentId: nextCurrentId }))
  }
  const goToNeighbor = (delta: 1 | -1, flySign: 1 | -1) => {
    if (isCurrentActive) return
    setPeekDirection(delta)
    void swipeRef.current?.flyOff(flySign).then(animated => {
      if (animated) commitNeighbor(delta)
    })
  }
  const peekStyle = frontHeight > 0 ? { minHeight: frontHeight, maxHeight: frontHeight } : undefined

  return (
    <div className="flex flex-col gap-2.5 pt-2.5">
      <LazyMotion features={domMax}>
        <div className="relative select-none">
          <div className="relative" style={{ marginTop: STACK_MARGIN_TOP }}>
            <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
              {n > 2 && (
                <m.div
                  className="absolute inset-0"
                  style={{ x: secondPeekX, y: secondPeekY, rotate: secondPeekRotate, scale: secondPeekScale, opacity: secondPeekOpacity, transformOrigin: "top center" }}
                >
                  <div className="h-full w-full rounded-3xl border border-border bg-card shadow-sm box-border" style={peekStyle} />
                </m.div>
              )}
              {peekItem && (
                <m.div
                  className="absolute inset-0 z-[1]"
                  style={{ x: peekX, y: peekY, rotate: peekRotate, scale: peekScale, opacity: peekOpacity, transformOrigin: "top center" }}
                >
                  <div className="pointer-events-none box-border overflow-hidden" style={peekStyle}>
                    {cardFor(peekItem, true)}
                  </div>
                </m.div>
              )}
            </div>

            <div ref={frontCardRef} className="relative z-10">
              <SwipeCard
                key={current.id}
                ref={swipeRef}
                stackDragX={stackDragX}
                draggable={!isCurrentActive}
                onCommitLeft={() => commitNeighbor(1)}
                onCommitRight={() => commitNeighbor(-1)}
              >
                {cardFor(current, false)}
              </SwipeCard>
            </div>
          </div>
        </div>
      </LazyMotion>

      <div className="flex items-center justify-center gap-3 pt-0.5">
        <button
          type="button"
          disabled={isCurrentActive}
          onClick={() => goToNeighbor(-1, 1)}
          aria-label="Previous ticket"
          className="inline-flex items-center justify-center size-7 rounded-full border border-border text-foreground/50 transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-foreground/50"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <span className="text-xs tabular-nums text-foreground/45">{activeIndex + 1} of {n}</span>
        <button
          type="button"
          disabled={isCurrentActive}
          onClick={() => goToNeighbor(1, -1)}
          aria-label="Next ticket"
          className="inline-flex items-center justify-center size-7 rounded-full border border-border text-foreground/50 transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-foreground/50"
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  )
}
