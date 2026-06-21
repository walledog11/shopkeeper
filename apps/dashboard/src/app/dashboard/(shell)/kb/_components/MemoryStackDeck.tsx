"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { LazyMotion, domMax, m, useMotionValue, useTransform } from "motion/react"
import { FLY_OFF, STACK_DEPTH, STACK_MARGIN_TOP } from "@/app/dashboard/_components/home/needs-you-motion"
import { SwipeCard, type SwipeCardHandle } from "@/app/dashboard/_components/home/NeedsYouSwipeCard"
import type { ArticleWithBase } from "./kb-page-utils"
import { MemoryStackCard } from "./MemoryStackCard"

interface MemoryStackDeckProps {
  articles: ArticleWithBase[]
  activeArticleId: string | null
  onSelectArticle: (id: string) => void
}

interface MemoryStackDeckState {
  activeArticleId: string | null
  articleIdsKey: string
  currentId: string | null
}

export function MemoryStackDeck({
  articles,
  activeArticleId,
  onSelectArticle,
}: MemoryStackDeckProps) {
  const articleIdsKey = articles.map(article => article.id).join("|")
  const initialCurrentId = activeArticleId && articles.some(article => article.id === activeArticleId)
    ? activeArticleId
    : articles.length > 0 ? articles[0].id : null
  const [currentState, setCurrentState] = useState<MemoryStackDeckState>(() => ({
    activeArticleId,
    articleIdsKey,
    currentId: initialCurrentId,
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

  const activeArticleIsInDeck = Boolean(activeArticleId && articles.some(article => article.id === activeArticleId))
  const currentId = currentState.currentId
  const n = articles.length
  const mod = (value: number) => ((value % n) + n) % n
  const activeIndex = n > 0 ? Math.max(0, articles.findIndex(article => article.id === currentId)) : 0
  const current = n > 0 ? articles[activeIndex] : null
  const peekItem = n > 1 ? articles[mod(activeIndex + peekDirection)] : null

  useEffect(() => {
    setCurrentState(previous => {
      if (previous.activeArticleId === activeArticleId && previous.articleIdsKey === articleIdsKey) {
        return previous
      }

      const previousCurrentIsInDeck = Boolean(
        previous.currentId && articles.some(article => article.id === previous.currentId),
      )
      const nextCurrentId = activeArticleIsInDeck
        ? activeArticleId
        : previousCurrentIsInDeck
          ? previous.currentId
          : articles.length > 0 ? articles[0].id : null

      return { activeArticleId, articleIdsKey, currentId: nextCurrentId }
    })
  }, [activeArticleId, activeArticleIsInDeck, articleIdsKey, articles])

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

  const cardFor = (article: ArticleWithBase, isPeek: boolean) => (
    <MemoryStackCard
      article={article}
      isActive={!isPeek && activeArticleId === article.id}
      onOpen={() => onSelectArticle(article.id)}
    />
  )

  if (n === 1) {
    return <div className="pt-2.5">{cardFor(current, false)}</div>
  }

  const commitNeighbor = (delta: 1 | -1) => {
    setPeekDirection(delta)
    const nextCurrentId = articles[mod(activeIndex + delta)].id
    setCurrentState(previous => ({ ...previous, currentId: nextCurrentId }))
  }

  const goToNeighbor = (delta: 1 | -1, flySign: 1 | -1) => {
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
          aria-label="Previous note"
          className="inline-flex size-7 items-center justify-center rounded-full border border-border text-foreground/50 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <span className="text-xs tabular-nums text-foreground/45">{activeIndex + 1} of {n}</span>
        <button
          type="button"
          onClick={() => goToNeighbor(1, -1)}
          aria-label="Next note"
          className="inline-flex size-7 items-center justify-center rounded-full border border-border text-foreground/50 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  )
}
