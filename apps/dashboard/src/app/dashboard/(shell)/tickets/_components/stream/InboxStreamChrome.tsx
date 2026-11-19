"use client"

import { ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"
import { boardCardListClassName } from "@/lib/ui/board-card-styles"
import { cn } from "@/lib/ui/cn"

export function InboxNeedsReviewLead({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <p className="px-0.5 text-sm leading-relaxed text-muted-foreground">
      <span className="font-semibold tabular-nums text-foreground">{count}</span>
      {" "}
      {count === 1 ? "needs review" : "need review"}
    </p>
  )
}

export function InboxWaitingLead({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <p className="px-0.5 text-sm leading-relaxed text-muted-foreground">
      <span className="font-semibold tabular-nums text-foreground">{count}</span>
      {" "}
      {count === 1 ? "is waiting" : "are waiting"} on the customer
    </p>
  )
}

export function InboxExternalLead({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <p className="px-0.5 text-sm leading-relaxed text-muted-foreground">
      <span className="font-semibold tabular-nums text-foreground">{count}</span>
      {" "}
      {count === 1 ? "looks outside your store" : "look outside your store"} but may still matter
    </p>
  )
}

function InboxStreamFold({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator">
      <div className="h-px flex-1 bg-border/50" aria-hidden />
      <span className="text-[13px] text-muted-foreground/90">
        {children ?? "The rest"}
      </span>
      <div className="h-px flex-1 bg-border/50" aria-hidden />
    </div>
  )
}

export function InboxStreamSection({
  count,
  lead,
  foldBefore,
  testId,
  children,
}: {
  count: number
  lead?: ReactNode
  foldBefore?: boolean
  testId?: string
  children: ReactNode
}) {
  if (count === 0) return null

  return (
    <section className="flex flex-col gap-3" data-testid={testId}>
      {foldBefore && <InboxStreamFold />}
      {lead}
      <ul className={boardCardListClassName}>{children}</ul>
    </section>
  )
}

export function InboxSpamSection({
  count,
  children,
}: {
  count: number
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)

  if (count === 0) return null

  return (
    <section className="flex flex-col gap-2 pt-1" data-testid="inbox-section-spam">
      <button
        type="button"
        onClick={() => setExpanded(current => !current)}
        className="flex w-full items-center gap-2 rounded-xl px-0.5 py-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={expanded}
      >
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")}
        />
        <span>
          Filed as spam
          <span className="ml-1.5 tabular-nums text-muted-foreground/80">({count})</span>
        </span>
      </button>
      {expanded && (
        <ul className={boardCardListClassName}>{children}</ul>
      )}
    </section>
  )
}
