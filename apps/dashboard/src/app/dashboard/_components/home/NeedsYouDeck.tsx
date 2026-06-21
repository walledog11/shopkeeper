"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { LazyMotion, domMax, m, useMotionValue, useTransform } from "motion/react"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import { NeedsYouAllClear } from "./NeedsYouAllClear"
import { FLY_OFF, STACK_DEPTH, STACK_MARGIN_TOP } from "./needs-you-motion"
import { NeedsYouCard, NeedsYouCardPeek, StackStrip } from "./NeedsYouCards"
import { SwipeCard, type SwipeCardHandle } from "./NeedsYouSwipeCard"

interface Props {
  items: HomeNeedsAttentionItem[]
  agentName: string
  onApproved: () => void
}

export function NeedsYouDeck({ items, agentName, onApproved }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [currentId, setCurrentId] = useState<string | null>(null)
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
  const peekItem = n > 1 ? deck[mod(activeIndex + peekDirection)] : null

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
  }, [current?.threadId, stackDragX])

  useLayoutEffect(() => {
    const node = frontCardRef.current
    if (!node) return

    const updateHeight = () => setFrontHeight(node.offsetHeight)
    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)
    return () => observer.disconnect()
  }, [current?.threadId])

  if (n === 0 || !current) return <NeedsYouAllClear agentName={agentName} />

  const commitNeighbor = (indexDelta: 1 | -1) => {
    setPeekDirection(indexDelta)
    setCurrentId(deck[mod(activeIndex + indexDelta)].threadId)
  }

  const goToNeighbor = (indexDelta: 1 | -1, flySign: 1 | -1) => {
    if (n <= 1) return
    setPeekDirection(indexDelta)
    void swipeRef.current?.flyOff(flySign).then(animated => {
      if (animated) commitNeighbor(indexDelta)
    })
  }

  const dismiss = (threadId: string) => {
    const next = deck[mod(activeIndex + 1)]
    setPeekDirection(1)
    void swipeRef.current?.flyOff(-1).then(animated => {
      if (!animated) return
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
              style={{ marginTop: STACK_MARGIN_TOP }}
            >
              {(peekItem || n > 2) && (
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

                  {peekItem && (
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
                        item={peekItem}
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
                  draggable={n > 1 && current.kind !== "needs_merchant_input"}
                  onCommitLeft={() => commitNeighbor(1)}
                  onCommitRight={() => commitNeighbor(-1)}
                >
                  <NeedsYouCard
                    item={current}
                    agentName={agentName}
                    onSent={() => dismiss(current.threadId)}
                    onAnswered={onApproved}
                  />
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
