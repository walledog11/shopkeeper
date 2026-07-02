"use client"

import type { ComponentType, ReactNode } from "react"
import { Layers, List } from "lucide-react"
import { cn } from "@/lib/ui/cn"

interface BoardColumnShellProps {
  label: string
  description?: string
  count: number
  icon: ComponentType<{ className?: string }>
  accentDotClassName?: string
  expanded: boolean
  canExpand: boolean
  onExpandedChange: (expanded: boolean) => void
  isLoading: boolean
  error: unknown
  loading: ReactNode
  errorContent: ReactNode
  empty: ReactNode
  children: ReactNode
  sectionClassName?: string
  headerClassName?: string
  titleClassName?: string
  descriptionClassName?: string
}

export function BoardColumnShell({
  label,
  description,
  count,
  icon: Icon,
  accentDotClassName,
  expanded,
  canExpand,
  onExpandedChange,
  isLoading,
  error,
  loading,
  errorContent,
  empty,
  children,
  sectionClassName = "flex min-w-0 flex-col",
  headerClassName = "mb-3 flex min-h-10 items-start justify-between gap-3 px-1",
  titleClassName = "truncate text-xs font-semibold uppercase text-strong",
  descriptionClassName = "mt-1 line-clamp-2 text-xs leading-relaxed text-faint",
}: BoardColumnShellProps) {
  let content = children
  if (isLoading && count === 0) {
    content = loading
  } else if (error) {
    content = errorContent
  } else if (count === 0) {
    content = empty
  }

  return (
    <section className={sectionClassName}>
      <div className={headerClassName}>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {accentDotClassName ? <span className={cn("size-1.5 shrink-0 rounded-full", accentDotClassName)} aria-hidden /> : null}
            <Icon className="size-3.5 shrink-0 text-faint" />
            <h2 className={titleClassName}>{label}</h2>
          </div>
          {description ? <p className={descriptionClassName}>{description}</p> : null}
        </div>
        {canExpand && (
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            aria-label={expanded ? `Collapse ${label} stack` : `Expand ${label} stack`}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-strong"
          >
            {expanded ? <Layers className="size-3" aria-hidden /> : <List className="size-3" aria-hidden />}
            {expanded ? "Stack" : "Expand"}
          </button>
        )}
      </div>

      {content}
    </section>
  )
}
