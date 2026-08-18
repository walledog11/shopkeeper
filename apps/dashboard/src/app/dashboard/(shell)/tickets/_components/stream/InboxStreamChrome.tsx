"use client"

import { ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"
import { cn } from "@/lib/ui/cn"

const SERIF = "[font-family:var(--m-serif),Georgia,'Times_New_Roman',serif]"

export function InboxNeedsReviewLead({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <p className="px-0.5 text-sm leading-relaxed text-muted-foreground">
      <span className="font-semibold tabular-nums text-foreground">{count}</span>
      {" "}
      {count === 1 ? "needs review" : "need review"}
      {" "}
      <span className={cn("italic text-muted-foreground/90", SERIF)}>before you move on.</span>
    </p>
  )
}

export function InboxWaitingLead({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <p className="px-0.5 text-sm leading-relaxed text-muted-foreground">
      <span className="font-semibold tabular-nums text-foreground">{count}</span>
      {" "}
      {count === 1 ? "is waiting" : "are waiting"}
      {" "}
      <span className={cn("italic text-muted-foreground/90", SERIF)}>on the customer.</span>
    </p>
  )
}

export function InboxExternalLead({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <p className="px-0.5 text-sm leading-relaxed text-muted-foreground">
      <span className="font-semibold tabular-nums text-foreground">{count}</span>
      {" "}
      {count === 1 ? "looks outside your store" : "look outside your store"}
      {" "}
      <span className={cn("italic text-muted-foreground/90", SERIF)}>but may still matter.</span>
    </p>
  )
}

export function InboxStreamFold({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator">
      <div className="h-px flex-1 bg-border/50" aria-hidden />
      <span className={cn("text-[13px] italic text-muted-foreground/90", SERIF)}>
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
      <ul className="flex flex-col gap-3">{children}</ul>
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
        <ul className="flex flex-col gap-3">{children}</ul>
      )}
    </section>
  )
}
