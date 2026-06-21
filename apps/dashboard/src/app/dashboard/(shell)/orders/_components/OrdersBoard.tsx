"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  ExternalLink,
  Layers,
  List,
  Loader2,
  MessageSquarePlus,
  Package,
  RotateCcw,
  Truck,
  User,
} from "lucide-react"
import { LazyMotion, domMax, m, useMotionValue, useTransform } from "motion/react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { FLY_OFF, STACK_DEPTH, STACK_MARGIN_TOP } from "@/app/dashboard/_components/home/needs-you-motion"
import { SwipeCard, type SwipeCardHandle } from "@/app/dashboard/_components/home/NeedsYouSwipeCard"
import { errorMessageFromUnknown } from "@/lib/api/fetcher"
import { formatRelativeTime, formatShortDate } from "@/lib/format/date"
import {
  ORDER_BOARD_COLUMNS,
  PILL_DOT,
  PILL_TEXT,
  classifyOrder,
  financialPill,
  fulfillmentPill,
  lineItemsSummary,
  orderItemCount,
  type OrderColumnId,
  type OrderRow,
  type PillTone,
} from "./orders-board-model"
import { startOrderSupportThread } from "./order-requests"

export interface OrderColumnState {
  entries: OrderRow[]
  error: unknown
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  onRetry: () => void
}

export type OrdersBoardState = Record<OrderColumnId, OrderColumnState>

const COLUMN_ICON: Record<OrderColumnId, ComponentType<{ className?: string }>> = {
  needs_fulfillment: Package,
  unpaid: CreditCard,
  fulfilled: Truck,
  refunded: RotateCcw,
}

const COLUMN_DOT: Record<OrderColumnId, string> = {
  needs_fulfillment: "bg-amber-500",
  unpaid: "bg-rose-500",
  fulfilled: "bg-emerald-500",
  refunded: "bg-foreground/30",
}

const ORDER_TONE: Record<OrderColumnId, { icon: string; border: string }> = {
  needs_fulfillment: { icon: "border-amber-500/20 bg-amber-500/10 text-amber-300", border: "hover:border-amber-500/25" },
  unpaid: { icon: "border-rose-500/20 bg-rose-500/10 text-rose-300", border: "hover:border-rose-500/25" },
  fulfilled: { icon: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300", border: "hover:border-emerald-500/25" },
  refunded: { icon: "border-foreground/[0.10] bg-foreground/[0.05] text-foreground/55", border: "hover:border-foreground/[0.16]" },
}

function customerLabel(order: OrderRow): string {
  if (!order.customer) return "Guest checkout"
  return order.customer.name || order.customer.email
}

// ── Status pill ─────────────────────────────────────────────────────────────────

function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${PILL_TEXT[tone]}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${PILL_DOT[tone]}`} />
      {label}
    </span>
  )
}

// ── New ticket button ─────────────────────────────────────────────────────────

function NewTicketButton({ order }: { order: OrderRow }) {
  const { push } = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!order.customer) return null
  const customer = order.customer

  const startThread = async () => {
    setLoading(true)
    setError(null)
    try {
      const threadId = await startOrderSupportThread({
        shopifyCustomerId: String(customer.id),
        customerEmail: customer.email,
        customerName: customer.name,
        orderName: order.name,
      })
      push(`/dashboard/tickets?thread=${threadId}`)
    } catch (requestError) {
      setError(errorMessageFromUnknown(requestError, "Failed to start support thread."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={startThread}
        disabled={loading}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-40"
      >
        {loading ? <Loader2 className="size-3 animate-spin" /> : <MessageSquarePlus className="size-3.5" />}
        New ticket
      </button>
      {error && <p className="text-xs text-red-500" aria-live="polite">{error}</p>}
    </div>
  )
}

// ── Compact card ────────────────────────────────────────────────────────────────

function OrderCompactCard({
  order,
  isPeek = false,
  onOpen,
}: {
  order: OrderRow
  isPeek?: boolean
  onOpen: () => void
}) {
  const columnId = classifyOrder(order)
  const Icon = COLUMN_ICON[columnId]
  const tone = ORDER_TONE[columnId]
  const fn = financialPill(order.financial_status)
  const ff = fulfillmentPill(order.fulfillment_status)
  const summary = lineItemsSummary(order.line_items)
  const itemCount = orderItemCount(order)

  const body = (
    <>
      <div className="flex items-center gap-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground/90">{order.name}</h3>
            <span className="shrink-0 text-xs tabular-nums text-foreground/35">
              {formatRelativeTime(order.created_at)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-foreground/40">{customerLabel(order)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusPill label={fn.label} tone={fn.tone} />
        <StatusPill label={ff.label} tone={ff.tone} />
      </div>

      {summary && (
        <p className="mt-3 text-sm leading-relaxed text-foreground/55 line-clamp-2">{summary}</p>
      )}
    </>
  )

  return (
    <article className={`rounded-2xl border border-border bg-card px-4 py-4 shadow-sm transition-colors ${tone.border}`}>
      {isPeek ? (
        <div className="block w-full border-0 bg-transparent p-0 text-left [font-family:inherit]">{body}</div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full border-0 bg-transparent p-0 text-left [font-family:inherit] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/70"
        >
          {body}
        </button>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-xs text-foreground/45">
          <span className="text-sm font-bold text-foreground/85">${parseFloat(order.total_price).toFixed(2)}</span>
          <span className="text-foreground/35"> · {itemCount} item{itemCount !== 1 ? "s" : ""}</span>
        </span>
      </div>
    </article>
  )
}

// ── Detail dialog ─────────────────────────────────────────────────────────────

function OrderDetail({
  order,
  shop,
  onClose,
}: {
  order: OrderRow
  shop: string | null
  onClose: () => void
}) {
  const columnId = classifyOrder(order)
  const Icon = COLUMN_ICON[columnId]
  const tone = ORDER_TONE[columnId]
  const fn = financialPill(order.financial_status)
  const ff = fulfillmentPill(order.fulfillment_status)
  const itemCount = orderItemCount(order)
  const adminHref = shop ? `https://${shop}/admin/orders/${order.id}` : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-start gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
            <Icon className="size-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold leading-tight text-foreground">{order.name}</h2>
              <StatusPill label={fn.label} tone={fn.tone} />
              <StatusPill label={ff.label} tone={ff.tone} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/40">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-3" />
                {formatShortDate(order.created_at)}
              </span>
              {order.customer && (
                <span className="inline-flex items-center gap-1.5">
                  <User className="size-3" />
                  {order.customer.name || order.customer.email}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {order.customer && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/35">Customer</h3>
            <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
              <p className="text-sm font-semibold text-foreground/80">{order.customer.name || "—"}</p>
              <p className="text-sm text-foreground/55">{order.customer.email}</p>
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/35">
            Items · {itemCount}
          </h3>
          <div className="space-y-2">
            {order.line_items.length > 0 ? (
              order.line_items.map((item, idx) => (
                <div
                  key={`${item.title}-${idx}`}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-foreground/[0.02] p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground/80">{item.title}</p>
                    {item.variant_title && (
                      <p className="text-xs text-foreground/45">{item.variant_title}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-foreground/55">×{item.quantity}</span>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-border bg-foreground/[0.03] p-3 text-sm text-foreground/40">
                No line items recorded.
              </p>
            )}
          </div>
        </section>

        <section className="flex items-center justify-between rounded-lg border border-border bg-foreground/[0.02] px-3 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground/35">Total</span>
          <span className="text-base font-bold text-foreground/90">${parseFloat(order.total_price).toFixed(2)}</span>
        </section>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <NewTicketButton order={order} />
          {adminHref && (
            <a
              href={adminHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/55 transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
              View in Shopify
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-md border border-border px-3 text-xs font-semibold text-foreground/55 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          Done
        </button>
      </div>
    </div>
  )
}

function OrderDetailDialog({
  order,
  shop,
  onClose,
}: {
  order: OrderRow | null
  shop: string | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(order)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton
        className="flex h-[86vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 shadow-xl sm:max-w-2xl lg:max-w-3xl"
      >
        <DialogTitle className="sr-only">Order detail</DialogTitle>
        {order ? <OrderDetail order={order} shop={shop} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

// ── Column chrome ─────────────────────────────────────────────────────────────

function OrderColumnLoading() {
  return (
    <div className="space-y-2.5" data-testid="orders-column-loading">
      {Array.from({ length: 3 }, (_, i) => `orders-board-skeleton-${i}`).map((key) => (
        <div key={key} className="h-36 animate-pulse rounded-2xl border border-border bg-card px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-foreground/[0.07]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-2/5 rounded bg-foreground/[0.07]" />
              <div className="h-2.5 w-28 rounded bg-foreground/[0.05]" />
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <div className="h-3 w-16 rounded-full bg-foreground/[0.06]" />
            <div className="h-3 w-20 rounded-full bg-foreground/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function OrderColumnEmpty({ columnId }: { columnId: OrderColumnId }) {
  const config = ORDER_BOARD_COLUMNS.find((column) => column.id === columnId) ?? ORDER_BOARD_COLUMNS[0]
  const Icon = COLUMN_ICON[columnId]

  return (
    <div className="flex h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-foreground/[0.10] bg-card/35 px-4 text-center">
      <span className="flex size-9 items-center justify-center rounded-lg border border-foreground/[0.10] bg-foreground/[0.04] text-foreground/35">
        <Icon className="size-4" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground/60">{config.emptyTitle}</p>
        <p className="mx-auto max-w-[210px] text-xs leading-relaxed text-foreground/35">{config.emptyBody}</p>
      </div>
    </div>
  )
}

function OrderColumnError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.06] px-4 py-4">
      <p className="text-sm font-semibold text-red-300">Failed to load this stack.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 text-xs font-semibold text-red-300/70 transition-colors hover:text-red-200"
      >
        Try again
      </button>
    </div>
  )
}

function LoadMoreButton({ isLoadingMore, onLoadMore }: { isLoadingMore: boolean; onLoadMore: () => void }) {
  return (
    <button
      type="button"
      onClick={onLoadMore}
      disabled={isLoadingMore}
      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-semibold text-foreground/40 transition-colors hover:bg-foreground/[0.04] hover:text-foreground/65 disabled:opacity-40"
    >
      {isLoadingMore ? <Loader2 className="size-3 animate-spin" /> : null}
      {isLoadingMore ? "Loading…" : "Load more"}
    </button>
  )
}

// ── Swipe deck ────────────────────────────────────────────────────────────────

function OrderStackDeck({
  orders,
  onExpand,
  onOpenOrder,
}: {
  orders: OrderRow[]
  onExpand: () => void
  onOpenOrder: (order: OrderRow) => void
}) {
  const idsKey = orders.map((order) => order.id).join("|")
  const [currentState, setCurrentState] = useState<{ currentId: number | null; idsKey: string }>(() => ({
    currentId: orders[0]?.id ?? null,
    idsKey,
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

  useEffect(() => {
    setCurrentState((previous) => {
      if (previous.idsKey === idsKey) return previous
      const stillPresent = Boolean(previous.currentId && orders.some((order) => order.id === previous.currentId))
      return { currentId: stillPresent ? previous.currentId : orders[0]?.id ?? null, idsKey }
    })
  }, [orders, idsKey])

  useEffect(() => {
    const unsubscribe = stackDragX.on("change", value => {
      if (Math.abs(value) < 1) return
      const nextDirection = value < 0 ? 1 : -1
      setPeekDirection(previous => previous === nextDirection ? previous : nextDirection)
    })
    return () => unsubscribe()
  }, [stackDragX])

  const n = orders.length
  const mod = (value: number) => ((value % n) + n) % n
  const activeIndex = n > 0 ? Math.max(0, orders.findIndex((order) => order.id === currentState.currentId)) : 0
  const current = n > 0 ? orders[activeIndex] : null
  const peekItem = n > 1 ? orders[mod(activeIndex + peekDirection)] : null

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

  if (n === 1) {
    return <OrderCompactCard order={current} onOpen={() => onOpenOrder(current)} />
  }

  const commitNeighbor = (delta: 1 | -1) => {
    setPeekDirection(delta)
    setCurrentState(previous => ({ ...previous, currentId: orders[mod(activeIndex + delta)].id }))
  }

  const goToNeighbor = (delta: 1 | -1, flySign: 1 | -1) => {
    setPeekDirection(delta)
    void swipeRef.current?.flyOff(flySign).then(animated => {
      if (animated) commitNeighbor(delta)
    })
  }

  const cardFor = (order: OrderRow, isPeekCard: boolean) => (
    <OrderCompactCard order={order} isPeek={isPeekCard} onOpen={onExpand} />
  )
  const peekStyle = frontHeight > 0 ? { minHeight: frontHeight, maxHeight: frontHeight } : undefined

  return (
    <div className="flex flex-col gap-2.5 pt-2.5" data-testid="orders-stack-deck">
      <LazyMotion features={domMax}>
        <div className="relative select-none">
          <div className="relative" style={{ marginTop: STACK_MARGIN_TOP }}>
            <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
              {n > 2 && (
                <m.div
                  className="absolute inset-0"
                  style={{ x: secondPeekX, y: secondPeekY, rotate: secondPeekRotate, scale: secondPeekScale, opacity: secondPeekOpacity, transformOrigin: "top center" }}
                >
                  <div className="h-full w-full rounded-2xl border border-border bg-card shadow-sm box-border" style={peekStyle} />
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
                draggable
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
          onClick={() => goToNeighbor(-1, 1)}
          aria-label="Previous order"
          className="inline-flex size-7 items-center justify-center rounded-full border border-border text-foreground/50 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <span className="text-xs tabular-nums text-foreground/45">{activeIndex + 1} of {n}</span>
        <button
          type="button"
          onClick={() => goToNeighbor(1, -1)}
          aria-label="Next order"
          className="inline-flex size-7 items-center justify-center rounded-full border border-border text-foreground/50 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

function OrderStackColumn({
  columnId,
  state,
  expanded,
  onExpandedChange,
  onOpenOrder,
}: {
  columnId: OrderColumnId
  state: OrderColumnState
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onOpenOrder: (order: OrderRow) => void
}) {
  const config = ORDER_BOARD_COLUMNS.find((column) => column.id === columnId) ?? ORDER_BOARD_COLUMNS[0]
  const Icon = COLUMN_ICON[columnId]
  const canExpand = state.entries.length > 1

  return (
    <section className="flex min-w-0 flex-col">
      <div className="mb-3 flex min-h-10 items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`size-1.5 shrink-0 rounded-full ${COLUMN_DOT[columnId]}`} aria-hidden />
            <Icon className="size-3.5 shrink-0 text-foreground/35" />
            <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-foreground/70">{config.label}</h2>
            <span className="text-xs font-medium tabular-nums text-foreground/35">{state.entries.length}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/35">{config.description}</p>
        </div>
        {canExpand && (
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            aria-label={expanded ? `Collapse ${config.label} stack` : `Expand ${config.label} stack`}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border px-2 text-[11px] font-semibold text-foreground/45 transition-colors hover:bg-foreground/[0.04] hover:text-foreground/75"
          >
            {expanded ? <Layers className="size-3" aria-hidden /> : <List className="size-3" aria-hidden />}
            {expanded ? "Stack" : "Expand"}
          </button>
        )}
      </div>

      {state.isLoading && state.entries.length === 0 ? (
        <OrderColumnLoading />
      ) : state.error ? (
        <OrderColumnError onRetry={state.onRetry} />
      ) : state.entries.length === 0 ? (
        <OrderColumnEmpty columnId={columnId} />
      ) : expanded ? (
        <div className="space-y-2.5" data-testid="orders-stack-expanded">
          {state.entries.map((order) => (
            <OrderCompactCard key={order.id} order={order} onOpen={() => onOpenOrder(order)} />
          ))}
          {state.hasMore ? <LoadMoreButton isLoadingMore={state.isLoadingMore} onLoadMore={state.onLoadMore} /> : null}
        </div>
      ) : (
        <div className="space-y-2.5">
          <OrderStackDeck orders={state.entries} onExpand={() => onExpandedChange(true)} onOpenOrder={onOpenOrder} />
          {state.hasMore ? <LoadMoreButton isLoadingMore={state.isLoadingMore} onLoadMore={state.onLoadMore} /> : null}
        </div>
      )}
    </section>
  )
}

// ── Board ─────────────────────────────────────────────────────────────────────

export function OrdersBoard({ columns, shop }: { columns: OrdersBoardState; shop: string | null }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [expandedColumns, setExpandedColumns] = useState<Partial<Record<OrderColumnId, boolean>>>({})

  const allOrders = Object.values(columns).flatMap((column) => column.entries)
  const selectedOrder = selectedId !== null ? allOrders.find((order) => order.id === selectedId) ?? null : null

  return (
    <>
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-4">
        {ORDER_BOARD_COLUMNS.map((column) => (
          <OrderStackColumn
            key={column.id}
            columnId={column.id}
            state={columns[column.id]}
            expanded={expandedColumns[column.id] ?? false}
            onExpandedChange={(expanded) => setExpandedColumns((current) => ({ ...current, [column.id]: expanded }))}
            onOpenOrder={(order) => setSelectedId(order.id)}
          />
        ))}
      </div>

      <OrderDetailDialog order={selectedOrder} shop={shop} onClose={() => setSelectedId(null)} />
    </>
  )
}

// ── Search results ────────────────────────────────────────────────────────────

export function OrdersSearchResults({
  orders,
  shop,
  hasMore,
  isLoadingMore,
  loadMoreError,
  onLoadMore,
  emptyTitle,
  emptyDescription,
}: {
  orders: OrderRow[]
  shop: string | null
  hasMore: boolean
  isLoadingMore: boolean
  loadMoreError: string | null
  onLoadMore: () => void
  emptyTitle: string
  emptyDescription: string
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedOrder = selectedId !== null ? orders.find((order) => order.id === selectedId) ?? null : null

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="mb-1 text-sm font-semibold text-muted-foreground">{emptyTitle}</p>
        <p className="text-xs text-muted-foreground/70">{emptyDescription}</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => (
          <OrderCompactCard key={order.id} order={order} onOpen={() => setSelectedId(order.id)} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-5">
          {loadMoreError && <p className="mb-2 text-center text-xs text-red-500" aria-live="polite">{loadMoreError}</p>}
          <LoadMoreButton isLoadingMore={isLoadingMore} onLoadMore={onLoadMore} />
        </div>
      )}

      <OrderDetailDialog order={selectedOrder} shop={shop} onClose={() => setSelectedId(null)} />
    </>
  )
}
