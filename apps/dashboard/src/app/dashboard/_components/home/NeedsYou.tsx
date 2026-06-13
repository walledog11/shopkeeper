"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { AlertCircle, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { AnimatePresence, LazyMotion, domMax, m, useMotionValue, useTransform, type Variants } from "motion/react"
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

  const deck = items.filter(item => !dismissed.has(item.threadId))
  const n = deck.length
  if (n === 0) return <AllClear agentName={agentName} />

  const mod = (value: number) => ((value % n) + n) % n
  const activeIndex = Math.max(0, deck.findIndex(item => item.threadId === currentId))
  const current = deck[activeIndex]
  const behind = Math.min(n - 1, 2)

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
          {Array.from({ length: behind }).map((_, i) => {
            const depth = i + 1
            return (
              <div
                key={`strip-${i}`}
                aria-hidden
                className="absolute inset-x-0 top-0 h-full rounded-3xl border border-border bg-card shadow-sm"
                style={{
                  transform: `translateX(${-depth * 8}px) translateY(${-depth * 7}px) rotate(${-depth * 1.8}deg) scale(${1 - depth * 0.015})`,
                  transformOrigin: "top center",
                  opacity: 1 - depth * 0.16,
                  zIndex: 0,
                }}
              />
            )
          })}

          <AnimatePresence initial={false} mode="popLayout" custom={exitX}>
            <m.div
              key={current.threadId}
              custom={exitX}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="relative z-10"
            >
              <SwipeCard
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
  draggable,
  onSwipeLeft,
  onSwipeRight,
  children,
}: {
  draggable: boolean
  onSwipeLeft: () => void
  onSwipeRight: () => void
  children: ReactNode
}) {
  const x = useMotionValue(0)
  const y = useTransform(x, (value) => (value * value) / 650)

  return (
    <m.div
      drag={draggable ? "x" : false}
      style={{ x, y }}
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
