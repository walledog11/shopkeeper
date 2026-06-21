"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { LazyMotion, domMax, m, useMotionValue, useTransform } from "motion/react"
import { FLY_OFF, STACK_DEPTH, STACK_MARGIN_TOP } from "../home/needs-you-motion"
import { SwipeCard, type SwipeCardHandle } from "../home/NeedsYouSwipeCard"

type StackDeckControls = "count" | "dots" | "none"

interface StackDeckLabels {
  previous: string
  next: string
  count?: (current: number, total: number) => ReactNode
}

interface StackDeckRenderContext {
  activeIndex: number
  flyOff: (sign: -1 | 1) => Promise<boolean>
  frontHeight: number
  isPeek: boolean
  total: number
}

interface StackDeckProps<T> {
  items: readonly T[]
  className?: string
  getId: (item: T) => string
  renderCard: (item: T, context: StackDeckRenderContext) => ReactNode
  renderPeekCard?: (item: T, context: StackDeckRenderContext) => ReactNode
  empty?: ReactNode
  activeId?: string | null
  isDraggable?: boolean | ((item: T) => boolean)
  disableControlsWhenNotDraggable?: boolean
  onCurrentChange?: (item: T | null, id: string | null) => void
  labels: StackDeckLabels
  testId?: string
  peekShellClassName?: string
  singleItemClassName?: string
  stackSingleItem?: boolean
  controls?: StackDeckControls
}

interface StackDeckState {
  activeId: string | null
  currentId: string | null
  idsKey: string
}

const DEFAULT_PEEK_SHELL_CLASS_NAME = "h-full w-full rounded-2xl border border-border bg-card shadow-sm box-border"

function resolveDraggable<T>(
  isDraggable: StackDeckProps<T>["isDraggable"],
  item: T,
) {
  if (typeof isDraggable === "function") return isDraggable(item)
  return isDraggable ?? true
}

export function StackDeck<T>({
  items,
  className = "flex flex-col gap-2.5",
  getId,
  renderCard,
  renderPeekCard,
  empty = null,
  activeId = null,
  isDraggable,
  disableControlsWhenNotDraggable = false,
  onCurrentChange,
  labels,
  testId,
  peekShellClassName = DEFAULT_PEEK_SHELL_CLASS_NAME,
  singleItemClassName,
  stackSingleItem = false,
  controls = "count",
}: StackDeckProps<T>) {
  const itemIds = useMemo(() => items.map(getId), [getId, items])
  const idsKey = itemIds.join("|")
  const normalizedActiveId = activeId ?? null
  const initialCurrentId = normalizedActiveId && itemIds.includes(normalizedActiveId)
    ? normalizedActiveId
    : itemIds[0] ?? null
  const [currentState, setCurrentState] = useState<StackDeckState>(() => ({
    activeId: normalizedActiveId,
    currentId: initialCurrentId,
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

  const n = items.length
  const mod = (value: number) => ((value % n) + n) % n
  const activeIndex = n > 0 ? Math.max(0, itemIds.findIndex(id => id === currentState.currentId)) : 0
  const current = n > 0 ? items[activeIndex] ?? null : null
  const currentId = current ? itemIds[activeIndex] ?? getId(current) : null
  const peekItem = n > 1 ? items[mod(activeIndex + peekDirection)] ?? null : null
  const currentDraggable = current ? resolveDraggable(isDraggable, current) : false
  const controlsDisabled = disableControlsWhenNotDraggable && !currentDraggable
  const renderPeek = renderPeekCard ?? renderCard
  const measuredHeightStyle: CSSProperties | undefined = frontHeight > 0
    ? { minHeight: frontHeight, maxHeight: frontHeight }
    : undefined

  useEffect(() => {
    setCurrentState(previous => {
      if (previous.activeId === normalizedActiveId && previous.idsKey === idsKey) {
        return previous
      }

      const activeIdIsInDeck = Boolean(normalizedActiveId && itemIds.includes(normalizedActiveId))
      const previousCurrentIsInDeck = Boolean(previous.currentId && itemIds.includes(previous.currentId))
      const nextCurrentId = activeIdIsInDeck
        ? normalizedActiveId
        : previousCurrentIsInDeck
          ? previous.currentId
          : itemIds[0] ?? null

      return { activeId: normalizedActiveId, currentId: nextCurrentId, idsKey }
    })
  }, [idsKey, itemIds, normalizedActiveId])

  useEffect(() => {
    onCurrentChange?.(current, currentId)
  }, [current, currentId, onCurrentChange])

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
  }, [currentId, stackDragX])

  useLayoutEffect(() => {
    const node = frontCardRef.current
    if (!node) return

    const updateHeight = () => setFrontHeight(node.offsetHeight)
    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)
    return () => observer.disconnect()
  }, [currentId])

  if (n === 0 || !current || !currentId) return <>{empty}</>

  const renderContext = (itemIsPeek: boolean): StackDeckRenderContext => ({
    activeIndex,
    flyOff: (sign) => swipeRef.current?.flyOff(sign) ?? Promise.resolve(false),
    frontHeight,
    isPeek: itemIsPeek,
    total: n,
  })

  if (n === 1) {
    const card = renderCard(current, renderContext(false))

    if (stackSingleItem) {
      return (
        <div className={className} data-testid={testId}>
          <LazyMotion features={domMax}>
            <div className="relative select-none">
              <div className="relative" style={{ marginTop: STACK_MARGIN_TOP }}>
                <div ref={frontCardRef} className="relative z-10">
                  <SwipeCard
                    key={currentId}
                    ref={swipeRef}
                    stackDragX={stackDragX}
                    draggable={false}
                    onCommitLeft={() => undefined}
                    onCommitRight={() => undefined}
                  >
                    {card}
                  </SwipeCard>
                </div>
              </div>
            </div>
          </LazyMotion>
        </div>
      )
    }

    if (singleItemClassName) {
      return <div className={singleItemClassName}>{card}</div>
    }

    return <>{card}</>
  }

  const commitNeighbor = (delta: 1 | -1) => {
    setPeekDirection(delta)
    setCurrentState(previous => ({ ...previous, currentId: itemIds[mod(activeIndex + delta)] ?? null }))
  }

  const goToNeighbor = (delta: 1 | -1, flySign: 1 | -1) => {
    if (controlsDisabled) return
    setPeekDirection(delta)
    const animation = swipeRef.current?.flyOff(flySign)
    if (!animation) {
      commitNeighbor(delta)
      return
    }
    void animation.then(animated => {
      if (animated) commitNeighbor(delta)
    })
  }

  const buttonClassName = "inline-flex size-7 items-center justify-center rounded-full border border-border text-foreground/50 transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-foreground/50"
  const countText = labels.count?.(activeIndex + 1, n) ?? `${activeIndex + 1} of ${n}`

  return (
    <div className={className} data-testid={testId}>
      <LazyMotion features={domMax}>
        <div className="relative select-none">
          <div className="relative" style={{ marginTop: STACK_MARGIN_TOP }}>
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
                    <div className={peekShellClassName} style={measuredHeightStyle} />
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
                    <div className="pointer-events-none box-border overflow-hidden" style={measuredHeightStyle}>
                      {renderPeek(peekItem, renderContext(true))}
                    </div>
                  </m.div>
                )}
              </div>
            )}

            <div ref={frontCardRef} className="relative z-10">
              <SwipeCard
                key={currentId}
                ref={swipeRef}
                stackDragX={stackDragX}
                draggable={currentDraggable}
                onCommitLeft={() => commitNeighbor(1)}
                onCommitRight={() => commitNeighbor(-1)}
              >
                {renderCard(current, renderContext(false))}
              </SwipeCard>
            </div>
          </div>
        </div>
      </LazyMotion>

      {controls !== "none" && (
        <div className="flex items-center justify-center gap-3 pt-0.5">
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={() => goToNeighbor(-1, 1)}
            aria-label={labels.previous}
            className={buttonClassName}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>

          {controls === "dots" && (
            <div className="flex items-center gap-1.5">
              {itemIds.map((id, index) => (
                <span
                  key={id}
                  className={`size-1.5 rounded-full transition-colors ${index === activeIndex ? "bg-foreground/70" : "bg-foreground/20"}`}
                />
              ))}
            </div>
          )}

          <span className="text-xs tabular-nums text-foreground/45">{countText}</span>

          <button
            type="button"
            disabled={controlsDisabled}
            onClick={() => goToNeighbor(1, -1)}
            aria-label={labels.next}
            className={buttonClassName}
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
