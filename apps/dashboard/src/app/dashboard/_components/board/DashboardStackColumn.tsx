"use client"

import type { ComponentType, ReactNode } from "react"
import { StackDeck } from "@/app/dashboard/_components/stack/StackDeck"
import { cn } from "@/lib/ui/cn"
import { BoardColumnShell } from "./BoardColumnShell"
import { BoardLoadMoreButton } from "./BoardLoadMoreButton"

export interface DashboardStackColumnState<T> {
  entries: readonly T[]
  error: unknown
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  onRetry: () => void
}

interface DashboardStackColumnRenderContext {
  isPeek: boolean
  onOpen: () => void
}

interface DashboardStackColumnProps<T> {
  label: string
  description?: string
  state: DashboardStackColumnState<T>
  icon: ComponentType<{ className?: string }>
  accentDotClassName?: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  getId: (item: T) => string
  onOpenItem: (item: T) => void
  renderCard: (item: T, context: DashboardStackColumnRenderContext) => ReactNode
  deckLabels: { previous: string; next: string }
  variant?: "deck" | "grid"
  gridClassName?: string
  stackTestId?: string
  expandedTestId?: string
  gridTestId?: string
  loading: ReactNode
  errorContent: ReactNode
  empty: ReactNode
  loadingLabel?: string
  peekShellClassName?: string
  peekCardClassName?: string
  headerClassName?: string
  titleClassName?: string
}

export function BoardColumnLoading({
  testId,
  keyPrefix,
  cardClassName,
  shape = "paragraph",
}: {
  testId: string
  keyPrefix: string
  cardClassName?: string
  shape?: "paragraph" | "pills"
}) {
  return (
    <div className="space-y-2.5" data-testid={testId}>
      {Array.from({ length: 3 }, (_, i) => `${keyPrefix}-${i}`).map((key) => (
        <div
          key={key}
          className={cn("animate-pulse border border-border bg-card px-4 py-4", cardClassName)}
        >
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-foreground/[0.07]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className={cn("h-3 rounded bg-foreground/[0.07]", shape === "pills" ? "w-2/5" : "w-3/5")} />
              <div className={cn("h-2.5 rounded bg-foreground/[0.05]", shape === "pills" ? "w-28" : "w-24")} />
            </div>
          </div>
          {shape === "pills" ? (
            <div className="mt-5 flex gap-3">
              <div className="h-3 w-16 rounded-full bg-foreground/[0.06]" />
              <div className="h-3 w-20 rounded-full bg-foreground/[0.06]" />
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              <div className="h-3 w-4/5 rounded bg-foreground/[0.06]" />
              <div className="h-3 w-full rounded bg-foreground/[0.05]" />
              <div className="h-3 w-2/3 rounded bg-foreground/[0.05]" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function BoardColumnEmpty({
  body,
  icon: Icon,
  title,
  className,
}: {
  body: string
  icon: ComponentType<{ className?: string }>
  title: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 border border-dashed border-foreground/[0.10] bg-card/35 px-4 text-center", className)}>
      <span className="flex size-9 items-center justify-center rounded-lg border border-foreground/[0.10] bg-foreground/[0.04] text-foreground/35">
        <Icon className="size-4" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground/60">{title}</p>
        <p className="mx-auto max-w-[210px] text-xs leading-relaxed text-foreground/35">
          {body}
        </p>
      </div>
    </div>
  )
}

export function BoardColumnError({
  className,
  textClassName = "text-red-200",
  onRetry,
}: {
  className?: string
  textClassName?: string
  onRetry: () => void
}) {
  return (
    <div className={cn("border border-red-500/15 bg-red-500/[0.06] px-4 py-4", className)}>
      <p className={cn("text-sm font-semibold", textClassName)}>Failed to load this stack.</p>
      <button
        type="button"
        onClick={onRetry}
        className={cn("mt-2 text-xs font-semibold transition-colors", textClassName, "opacity-70 hover:opacity-100")}
      >
        Try again
      </button>
    </div>
  )
}

function DashboardStackDeck<T>({
  deckLabels,
  getId,
  items,
  onExpand,
  onOpenItem,
  peekCardClassName,
  peekShellClassName,
  renderCard,
  stackTestId,
}: {
  deckLabels: { previous: string; next: string }
  getId: (item: T) => string
  items: readonly T[]
  onExpand: () => void
  onOpenItem: (item: T) => void
  peekCardClassName?: string
  peekShellClassName?: string
  renderCard: (item: T, context: DashboardStackColumnRenderContext) => ReactNode
  stackTestId?: string
}) {
  const renderDeckCard = (item: T, isPeek: boolean) =>
    renderCard(item, { isPeek, onOpen: onExpand })

  return (
    <StackDeck
      items={items}
      className="flex flex-col gap-2.5 pt-2.5"
      getId={getId}
      labels={deckLabels}
      controls="count"
      testId={stackTestId}
      peekShellClassName={peekShellClassName}
      peekCardClassName={peekCardClassName}
      renderCard={(item, context) => {
        if (context.total === 1) {
          return renderCard(item, { isPeek: false, onOpen: () => onOpenItem(item) })
        }
        return renderDeckCard(item, context.isPeek)
      }}
      renderPeekCard={(item) => renderDeckCard(item, true)}
    />
  )
}

export function DashboardStackColumn<T>({
  label,
  description,
  state,
  icon,
  accentDotClassName,
  expanded,
  onExpandedChange,
  getId,
  onOpenItem,
  renderCard,
  deckLabels,
  variant = "deck",
  gridClassName = "grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3",
  stackTestId,
  expandedTestId,
  gridTestId,
  loading,
  errorContent,
  empty,
  loadingLabel,
  peekShellClassName,
  peekCardClassName,
  headerClassName,
  titleClassName,
}: DashboardStackColumnProps<T>) {
  const canExpand = variant === "deck" && state.entries.length > 1
  const loadMore = state.hasMore ? (
    <BoardLoadMoreButton
      isLoadingMore={state.isLoadingMore}
      loadingLabel={loadingLabel}
      onLoadMore={state.onLoadMore}
    />
  ) : null

  const list = (
    <div className="space-y-2.5" data-testid={expandedTestId}>
      {state.entries.map((item) => (
        <div key={getId(item)}>
          {renderCard(item, { isPeek: false, onOpen: () => onOpenItem(item) })}
        </div>
      ))}
      {loadMore}
    </div>
  )

  return (
    <BoardColumnShell
      label={label}
      description={description}
      count={state.entries.length}
      icon={icon}
      accentDotClassName={accentDotClassName}
      expanded={expanded}
      canExpand={canExpand}
      onExpandedChange={onExpandedChange}
      isLoading={state.isLoading}
      error={state.error}
      loading={loading}
      errorContent={errorContent}
      empty={empty}
      headerClassName={headerClassName}
      titleClassName={titleClassName}
    >
      {variant === "grid" ? (
        <div className="space-y-2.5" data-testid={gridTestId}>
          <div className={gridClassName}>
            {state.entries.map((item) => (
              <div key={getId(item)}>
                {renderCard(item, { isPeek: false, onOpen: () => onOpenItem(item) })}
              </div>
            ))}
          </div>
          {loadMore}
        </div>
      ) : expanded ? (
        list
      ) : (
        <div className="space-y-2.5">
          <DashboardStackDeck
            deckLabels={deckLabels}
            getId={getId}
            items={state.entries}
            onExpand={() => onExpandedChange(true)}
            onOpenItem={onOpenItem}
            peekCardClassName={peekCardClassName}
            peekShellClassName={peekShellClassName}
            renderCard={renderCard}
            stackTestId={stackTestId}
          />
          {loadMore}
        </div>
      )}
    </BoardColumnShell>
  )
}
