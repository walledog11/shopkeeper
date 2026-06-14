"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { AlertCircle, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { LazyMotion, animate, domMax, m, useMotionValue, useTransform } from "motion/react"
import { Card } from "@/components/ui/card"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"

interface Props {
  items: HomeNeedsAttentionItem[]
  agentName: string
  onApproved: () => void
}

const SWIPE_DISTANCE = 90
const SWIPE_VELOCITY = 420
const FLY_OFF = 340
const FLY_OFF_DURATION = 0.28
const STACK_DEPTH = { x: 8, y: 7, rotate: 1.8, scale: 0.015, opacity: 0.16 } as const
const STACK_MARGIN_TOP = STACK_DEPTH.y * 2
const STACK_MARGIN_LEFT = STACK_DEPTH.x * 2

function arcY(x: number) {
  return (x * x) / 650
}

function arcRotate(x: number) {
  return x * 0.055
}

type SwipeCardHandle = {
  flyOff: (sign: -1 | 1) => Promise<void>
}

type BubbleTone = "action" | "reply" | "flag"

const BUBBLE_TONE: Record<BubbleTone, { label: string; bubble: string }> = {
  action: { label: "text-amber-700/70", bubble: "bg-amber-600/[0.09] border-amber-600/20" },
  reply: { label: "text-foreground/35", bubble: "bg-foreground/[0.04] border-border" },
  flag: { label: "text-amber-700/70", bubble: "bg-amber-600/[0.09] border-amber-600/20" },
}

export default function NeedsYou({ items, agentName, onApproved }: Props) {
  if (items.length === 0) return <AllClear agentName={agentName} />

  return <NeedsYouDeck items={items} agentName={agentName} onApproved={onApproved} />
}

function AllClear({ agentName }: { agentName: string }) {
  return (
    <section className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
        <Check aria-hidden className="size-5 text-foreground/40" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-display-serif text-lg text-foreground">You&apos;re all caught up</h2>
        <p className="text-sm text-foreground/50">{agentName} will surface anything that needs your eye here.</p>
      </div>
    </section>
  )
}

function NeedsYouDeck({ items, agentName, onApproved }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [currentId, setCurrentId] = useState<string | null>(null)
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
  const secondPeekScale = useTransform(
    peekProgress,
    progress => 1 - STACK_DEPTH.scale * 2 * (1 - progress * 0.55),
  )
  const secondPeekOpacity = useTransform(
    peekProgress,
    progress => (1 - STACK_DEPTH.opacity * 2) + STACK_DEPTH.opacity * progress,
  )

  const deck = items.filter(item => !dismissed.has(item.threadId))
  const n = deck.length
  const mod = (value: number) => ((value % n) + n) % n
  const activeIndex = n > 0 ? Math.max(0, deck.findIndex(item => item.threadId === currentId)) : 0
  const current = n > 0 ? deck[activeIndex] : null
  const nextItem = n > 1 ? deck[mod(activeIndex + 1)] : null

  useEffect(() => {
    const controls = animate(stackDragX, 0, {
      type: "spring",
      stiffness: 420,
      damping: 34,
    })
    return () => controls.stop()
  }, [current?.threadId, stackDragX])

  useEffect(() => {
    const node = frontCardRef.current
    if (!node) return

    const updateHeight = () => setFrontHeight(node.offsetHeight)
    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)
    return () => observer.disconnect()
  }, [current?.threadId])

  if (n === 0 || !current) return <AllClear agentName={agentName} />

  const commitNeighbor = (indexDelta: 1 | -1) => {
    setCurrentId(deck[mod(activeIndex + indexDelta)].threadId)
  }

  const goToNeighbor = (indexDelta: 1 | -1, flySign: 1 | -1) => {
    if (n <= 1) return
    void swipeRef.current?.flyOff(flySign).then(() => commitNeighbor(indexDelta))
  }

  const dismiss = (threadId: string) => {
    const next = deck[mod(activeIndex + 1)]
    void swipeRef.current?.flyOff(-1).then(() => {
      setDismissed(prev => new Set(prev).add(threadId))
      setCurrentId(next && next.threadId !== threadId ? next.threadId : null)
      onApproved()
    })
  }

  return (
    <section id="needs-you" className="mt-10 flex flex-col gap-2.5">
      <div className="flex flex-col gap-3 w-full">
      <LazyMotion features={domMax}>
        <div className="relative select-none">
          <div
            className="relative"
            style={{ marginTop: STACK_MARGIN_TOP, marginLeft: STACK_MARGIN_LEFT }}
          >
            {(nextItem || n > 2) && (
              <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
                {n > 2 && (
                  <m.div
                    className="absolute inset-0"
                    style={{
                      x: secondPeekX,
                      y: secondPeekY,
                      rotate: secondPeekRotate,
                      scale: secondPeekScale,
                      opacity: secondPeekOpacity,
                      transformOrigin: "top center",
                    }}
                  >
                    <StackStrip minHeight={frontHeight > 0 ? frontHeight : undefined} />
                  </m.div>
                )}

                {nextItem && (
                  <m.div
                    className="absolute inset-0 z-[1]"
                    style={{
                      x: peekX,
                      y: peekY,
                      rotate: peekRotate,
                      scale: peekScale,
                      opacity: peekOpacity,
                      transformOrigin: "top center",
                    }}
                  >
                    <NeedsYouCardPeek
                      item={nextItem}
                      agentName={agentName}
                      minHeight={frontHeight > 0 ? frontHeight : undefined}
                    />
                  </m.div>
                )}
              </div>
            )}

            <div ref={frontCardRef} className="relative z-10">
              <SwipeCard
                key={current.threadId}
                ref={swipeRef}
                stackDragX={stackDragX}
                draggable={n > 1}
                onCommitLeft={() => commitNeighbor(1)}
                onCommitRight={() => commitNeighbor(-1)}
              >
                <NeedsYouCard item={current} agentName={agentName} onSent={() => dismiss(current.threadId)} />
              </SwipeCard>
            </div>
          </div>
        </div>
      </LazyMotion>

      {n > 1 && (
        <div className="flex items-center justify-center gap-3 pt-0.5">
          <button
            type="button"
            onClick={() => goToNeighbor(-1, 1)}
            aria-label="Previous card"
            className="inline-flex items-center justify-center size-7 rounded-full border border-border text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>

          <div className="flex items-center gap-1.5">
            {deck.map((item, i) => (
              <span
                key={item.threadId}
                className={`size-1.5 rounded-full transition-colors ${i === activeIndex ? "bg-foreground/70" : "bg-foreground/20"}`}
              />
            ))}
          </div>

          <span className="text-xs tabular-nums text-foreground/45">{activeIndex + 1} of {n}</span>

          <button
            type="button"
            onClick={() => goToNeighbor(1, -1)}
            aria-label="Next card"
            className="inline-flex items-center justify-center size-7 rounded-full border border-border text-foreground/50 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      )}
      </div>
    </section>
  )
}

const SwipeCard = forwardRef<SwipeCardHandle, {
  stackDragX: ReturnType<typeof useMotionValue<number>>
  draggable: boolean
  onCommitLeft: () => void
  onCommitRight: () => void
  children: ReactNode
}>(function SwipeCard({
  stackDragX,
  draggable,
  onCommitLeft,
  onCommitRight,
  children,
}, ref) {
  const dragX = useMotionValue(0)
  const dragY = useTransform(dragX, arcY)
  const dragRotate = useTransform(dragX, arcRotate)
  const opacity = useMotionValue(1)
  const isFlying = useRef(false)

  useEffect(() => {
    return dragX.on("change", value => {
      stackDragX.set(value)
    })
  }, [dragX, stackDragX])

  const flyOff = useCallback(async (sign: -1 | 1) => {
    if (isFlying.current) return
    isFlying.current = true

    try {
      const targetX = sign * FLY_OFF
      await Promise.all([
        animate(dragX, targetX, { duration: FLY_OFF_DURATION, ease: [0.32, 0, 0.67, 0] }),
        animate(stackDragX, targetX, { duration: FLY_OFF_DURATION, ease: [0.32, 0, 0.67, 0] }),
        animate(opacity, 0, { duration: FLY_OFF_DURATION, ease: "easeIn" }),
      ])
    } finally {
      isFlying.current = false
    }
  }, [dragX, opacity, stackDragX])

  useImperativeHandle(ref, () => ({ flyOff }), [flyOff])

  return (
    <m.div
      drag={draggable ? "x" : false}
      style={{ x: dragX, y: dragY, rotate: dragRotate, opacity, transformOrigin: "50% 100%" }}
      dragSnapToOrigin={false}
      dragElastic={0.5}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (isFlying.current) return

        const swiped = Math.abs(info.offset.x) > SWIPE_DISTANCE || Math.abs(info.velocity.x) > SWIPE_VELOCITY
        if (!swiped) {
          void Promise.all([
            animate(dragX, 0, { type: "spring", stiffness: 420, damping: 32 }),
            animate(stackDragX, 0, { type: "spring", stiffness: 420, damping: 32 }),
          ])
          return
        }

        const sign = info.offset.x < 0 ? -1 : 1
        void flyOff(sign).then(() => {
          if (sign < 0) onCommitLeft()
          else onCommitRight()
        })
      }}
      className="touch-pan-y cursor-grab active:cursor-grabbing"
    >
      {children}
    </m.div>
  )
})

function StackStrip({ minHeight }: { minHeight?: number }) {
  return (
    <div
      className="h-full w-full rounded-3xl border border-border bg-card shadow-sm pointer-events-none box-border"
      style={minHeight ? { minHeight, maxHeight: minHeight } : undefined}
    />
  )
}

function NeedsYouCardPeek({
  item,
  agentName,
  minHeight,
}: {
  item: HomeNeedsAttentionItem
  agentName: string
  minHeight?: number
}) {
  const title = item.tag?.trim() || item.headline
  const preview =
    item.replyText?.trim() ||
    item.actionText?.trim() ||
    item.proposalSummary

  return (
    <Card
      className="h-full w-full bg-card border-border rounded-3xl shadow-sm px-5 sm:px-6 py-5 pointer-events-none box-border overflow-hidden"
      style={minHeight ? { minHeight, maxHeight: minHeight } : undefined}
    >
      <h3 className="font-sans font-semibold text-2xl sm:text-3xl text-foreground leading-tight tracking-tight line-clamp-2">
        {title}
      </h3>

      <div className="mt-2 flex items-center gap-1.5 text-sm text-foreground/45">
        <span className="font-medium text-foreground/70 truncate min-w-0">{item.customerName}</span>
        <span className="shrink-0 text-foreground/25">·</span>
        <span className="shrink-0">{item.channelName}</span>
        <span className="shrink-0 text-foreground/25">·</span>
        <span className="shrink-0 tabular-nums">{item.timeAgo}</span>
      </div>

      <p className="mt-4 text-sm text-foreground/55">{agentName} proposes:</p>

      <div className={`mt-2 rounded-2xl px-4 py-3 border ${BUBBLE_TONE.reply.bubble}`}>
        <p className="text-sm font-medium text-foreground/85 leading-relaxed line-clamp-4">{preview}</p>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <div className="h-12 rounded-2xl bg-foreground/[0.08]" />
        <div className="h-12 rounded-2xl bg-foreground/[0.05]" />
      </div>
    </Card>
  )
}

function NeedsYouCard({ item, agentName, onSent }: { item: HomeNeedsAttentionItem; agentName: string; onSent: () => void }) {
  const [isApproving, setIsApproving] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const isConsequential = item.kind === "needs_review"
  const title = item.tag?.trim() || item.headline

  const bubbles: { key: string; label: string; text: string; tone: BubbleTone }[] = []
  if (item.actionText) bubbles.push({ key: "action", label: "Shopify", text: item.actionText, tone: "action" })
  if (item.replyText) bubbles.push({ key: "reply", label: `${item.channelName} customer`, text: item.replyText, tone: "reply" })
  if (bubbles.length === 0) bubbles.push({ key: "flag", label: "Flagged", text: item.proposalSummary, tone: "flag" })

  const approve = async () => {
    if (isApproving) return
    setIsApproving(true)
    setApprovalError(null)

    try {
      const response = await fetch("/api/agent/quick-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: item.threadId }),
      })
      const data = await response.json().catch(() => null) as { error?: string } | null

      if (!response.ok) {
        setApprovalError(data?.error ?? "Could not complete this action.")
        return
      }

      onSent()
    } catch {
      setApprovalError("Network error. Try again.")
    } finally {
      setIsApproving(false)
      setConfirming(false)
    }
  }

  const onApproveClick = () => {
    if (isConsequential && !confirming) {
      setConfirming(true)
      return
    }
    approve()
  }

  return (
    <Card className="bg-card border-border rounded-3xl shadow-sm px-5 sm:px-6 py-5">
      <h3 className="font-sans font-semibold text-2xl sm:text-3xl text-foreground leading-tight tracking-tight">
        {title}
      </h3>

      <div className="mt-2 flex items-center gap-1.5 text-sm text-foreground/45">
        <span className="font-medium text-foreground/70 truncate min-w-0">{item.customerName}</span>
        <span className="shrink-0 text-foreground/25">·</span>
        <span className="shrink-0">{item.channelName}</span>
        <span className="shrink-0 text-foreground/25">·</span>
        <span className="shrink-0 tabular-nums">{item.timeAgo}</span>
      </div>

      <p className="mt-4 text-sm text-foreground/55">{agentName} proposes:</p>

      <div className="mt-2 flex flex-col gap-3">
        {bubbles.map(bubble => (
          <div key={bubble.key} className="flex flex-col gap-1">
            <span className={`self-end text-[11px] font-semibold ${BUBBLE_TONE[bubble.tone].label}`}>
              {bubble.label}
            </span>
            <div className={`rounded-2xl px-4 py-3 border ${BUBBLE_TONE[bubble.tone].bubble}`}>
              <p className="text-sm font-medium text-foreground/85 leading-relaxed line-clamp-4">{bubble.text}</p>
            </div>
          </div>
        ))}
      </div>

      {approvalError && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle aria-hidden className="size-3 shrink-0" />
          {approvalError}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onApproveClick}
          disabled={isApproving}
          className={`inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-base font-semibold transition-colors disabled:opacity-40 ${
            confirming
              ? "bg-amber-600 hover:bg-amber-700 text-white"
              : isConsequential
                ? "bg-foreground text-background hover:bg-foreground/90 ring-2 ring-amber-500/70 ring-offset-2 ring-offset-card"
                : "bg-foreground text-background hover:bg-foreground/90"
          }`}
        >
          {isApproving && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {isApproving ? "Approving" : confirming ? "Confirm approve" : "Approve"}
        </button>

        {confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isApproving}
            className="inline-flex items-center justify-center w-full py-3.5 rounded-2xl text-base font-semibold bg-foreground/[0.05] hover:bg-foreground/[0.08] text-foreground/60 transition-colors"
          >
            Cancel
          </button>
        ) : (
          <Link
            href={`/dashboard/tickets?thread=${item.threadId}`}
            className="inline-flex items-center justify-center w-full py-3.5 rounded-2xl text-base font-semibold bg-foreground/[0.05] hover:bg-foreground/[0.08] text-foreground/60 transition-colors"
          >
            View Ticket
          </Link>
        )}
      </div>
    </Card>
  )
}
