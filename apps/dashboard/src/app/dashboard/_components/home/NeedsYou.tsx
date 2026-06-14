"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { AlertCircle, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { AnimatePresence, LazyMotion, domMax, m, useMotionValue, useTransform, type Variants } from "motion/react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"

interface Props {
  items: HomeNeedsAttentionItem[]
  agentName: string
  onApproved: () => void
}

const SWIPE_DISTANCE = 90
const SWIPE_VELOCITY = 420
const FLY_OFF = 340
const STACK_DEPTH = { x: 8, y: 7, rotate: 1.8, scale: 0.015, opacity: 0.16 } as const

const cardVariants: Variants = {
  enter: { scale: 0.95, y: 10, opacity: 0 },
  center: { scale: 1, y: 0, opacity: 1, transition: { type: "spring", stiffness: 340, damping: 34 } },
  exit: (x: number) => ({ x, opacity: 0, rotate: x > 0 ? 7 : -7, transition: { duration: 0.26, ease: "easeIn" } }),
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
  const [exitX, setExitX] = useState(-FLY_OFF)
  const stackDragX = useMotionValue(0)
  const peekProgress = useTransform(stackDragX, value => Math.min(Math.abs(value) / SWIPE_DISTANCE, 1))
  const peekX = useTransform(peekProgress, progress => -STACK_DEPTH.x * (1 - progress))
  const peekY = useTransform(peekProgress, progress => -STACK_DEPTH.y * (1 - progress))
  const peekRotate = useTransform(peekProgress, progress => -STACK_DEPTH.rotate * (1 - progress))
  const peekScale = useTransform(peekProgress, progress => 1 - STACK_DEPTH.scale * (1 - progress))
  const secondPeekX = useTransform(peekProgress, progress => -STACK_DEPTH.x * 2 * (1 - progress * 0.55))
  const secondPeekY = useTransform(peekProgress, progress => -STACK_DEPTH.y * 2 * (1 - progress * 0.55))
  const secondPeekRotate = useTransform(peekProgress, progress => -STACK_DEPTH.rotate * 2 * (1 - progress * 0.55))
  const secondPeekScale = useTransform(
    peekProgress,
    progress => 1 - STACK_DEPTH.scale * 2 * (1 - progress * 0.55),
  )

  const deck = items.filter(item => !dismissed.has(item.threadId))
  const n = deck.length
  const mod = (value: number) => ((value % n) + n) % n
  const activeIndex = n > 0 ? Math.max(0, deck.findIndex(item => item.threadId === currentId)) : 0
  const current = n > 0 ? deck[activeIndex] : null
  const nextItem = n > 1 ? deck[mod(activeIndex + 1)] : null

  useEffect(() => {
    stackDragX.set(0)
  }, [current?.threadId, stackDragX])

  if (n === 0 || !current) return <AllClear agentName={agentName} />

  const goToNeighbor = (indexDelta: 1 | -1, flySign: 1 | -1) => {
    if (n <= 1) return
    setExitX(flySign * FLY_OFF)
    setCurrentId(deck[mod(activeIndex + indexDelta)].threadId)
  }

  const dismiss = (threadId: string) => {
    const next = deck[mod(activeIndex + 1)]
    setExitX(-FLY_OFF)
    setDismissed(prev => new Set(prev).add(threadId))
    setCurrentId(next && next.threadId !== threadId ? next.threadId : null)
    onApproved()
  }

  return (
    <section id="needs-you" className="mt-10 flex flex-col gap-2.5">
      <div className="flex flex-col gap-3 w-full">
      <LazyMotion features={domMax}>
        <div className="relative select-none">
          {n > 2 && (
            <m.div
              aria-hidden
              className="absolute inset-x-0 top-0 z-0 pointer-events-none"
              style={{
                x: secondPeekX,
                y: secondPeekY,
                rotate: secondPeekRotate,
                scale: secondPeekScale,
                transformOrigin: "top center",
                opacity: 1 - STACK_DEPTH.opacity * 2,
              }}
            >
              <NeedsYouCardSkeleton />
            </m.div>
          )}

          {nextItem && (
            <m.div
              aria-hidden
              className="absolute inset-x-0 top-0 z-[1] pointer-events-none"
              style={{
                x: peekX,
                y: peekY,
                rotate: peekRotate,
                scale: peekScale,
                transformOrigin: "top center",
                opacity: 1 - STACK_DEPTH.opacity,
              }}
            >
              <NeedsYouCardPeek item={nextItem} agentName={agentName} />
            </m.div>
          )}

          <AnimatePresence initial={false} mode="popLayout" custom={exitX}>
            <m.div
              key={current.threadId}
              custom={exitX}
              variants={cardVariants}
              initial={false}
              animate="center"
              exit="exit"
              className="relative z-10"
            >
              <SwipeCard
                stackDragX={stackDragX}
                draggable={n > 1}
                onSwipeLeft={() => goToNeighbor(1, -1)}
                onSwipeRight={() => goToNeighbor(-1, 1)}
              >
                <NeedsYouCard item={current} agentName={agentName} onSent={() => dismiss(current.threadId)} />
              </SwipeCard>
            </m.div>
          </AnimatePresence>
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

function SwipeCard({
  stackDragX,
  draggable,
  onSwipeLeft,
  onSwipeRight,
  children,
}: {
  stackDragX: ReturnType<typeof useMotionValue<number>>
  draggable: boolean
  onSwipeLeft: () => void
  onSwipeRight: () => void
  children: ReactNode
}) {
  const dragX = useMotionValue(0)
  const dragY = useTransform(dragX, value => (value * value) / 650)
  const dragRotate = useTransform(dragX, value => value * 0.055)

  useEffect(() => {
    return dragX.on("change", value => {
      stackDragX.set(value)
    })
  }, [dragX, stackDragX])

  return (
    <m.div
      drag={draggable ? "x" : false}
      style={{ x: dragX, y: dragY, rotate: dragRotate, transformOrigin: "50% 100%" }}
      dragSnapToOrigin
      dragElastic={0.5}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        const swiped = Math.abs(info.offset.x) > SWIPE_DISTANCE || Math.abs(info.velocity.x) > SWIPE_VELOCITY
        if (!swiped) return
        if (info.offset.x < 0) onSwipeLeft()
        else onSwipeRight()
      }}
      className="touch-pan-y cursor-grab active:cursor-grabbing"
    >
      {children}
    </m.div>
  )
}

function NeedsYouCardSkeleton() {
  return (
    <Card className="bg-card border-border rounded-3xl shadow-sm px-5 sm:px-6 py-5 pointer-events-none">
      <Skeleton className="h-8 w-2/3 rounded-lg" />
      <div className="mt-2 flex items-center gap-2">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-4 w-12 rounded-md" />
        <Skeleton className="h-4 w-10 rounded-md" />
      </div>
      <Skeleton className="mt-4 h-4 w-24 rounded-md" />
      <Skeleton className="mt-2 h-24 w-full rounded-2xl" />
      <Skeleton className="mt-5 h-12 w-full rounded-2xl" />
      <Skeleton className="mt-2 h-12 w-full rounded-2xl" />
    </Card>
  )
}

function NeedsYouCardPeek({ item, agentName }: { item: HomeNeedsAttentionItem; agentName: string }) {
  const title = item.tag?.trim() || item.headline
  const preview =
    item.replyText?.trim() ||
    item.actionText?.trim() ||
    item.proposalSummary

  return (
    <Card className="bg-card border-border rounded-3xl shadow-sm px-5 sm:px-6 py-5 pointer-events-none">
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
