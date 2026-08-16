"use client"

import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import { NeedsYouAllClear } from "./NeedsYouAllClear"
import { NeedsYouDeck } from "./NeedsYouDeck"
import { needsYouCardShellClassName } from "./needs-you-card-styles"

interface Props {
  items: HomeNeedsAttentionItem[]
  agentName: string
  isLoading?: boolean
  onApproved: () => void
}

export default function NeedsYou({ items, agentName, isLoading = false, onApproved }: Props) {
  if (isLoading && items.length === 0) return <NeedsYouLoadingSkeleton />

  if (items.length === 0) return <NeedsYouAllClear agentName={agentName} />

  return <NeedsYouDeck items={items} agentName={agentName} onApproved={onApproved} />
}

function NeedsYouLoadingSkeleton() {
  return (
    <section
      id="needs-you"
      aria-busy="true"
      aria-label="Loading action plan cards"
      className="mt-5 sm:mt-10 flex flex-col gap-2.5"
    >
      <Card className={needsYouCardShellClassName("front")}>
        <div className="rounded-t-3xl border-b border-border/60 bg-card px-5 py-3.5 sm:px-6">
          <div className="flex w-full items-center gap-2">
            <Skeleton className="needs-you-shimmer h-10 w-10 shrink-0 rounded-2xl bg-foreground/[0.06]" />
            <Skeleton className="needs-you-shimmer h-10 min-w-0 flex-1 rounded-2xl bg-foreground/[0.06]" />
            <Skeleton className="needs-you-shimmer h-10 w-14 shrink-0 rounded-2xl bg-foreground/[0.06]" />
            <Skeleton className="needs-you-shimmer h-10 w-16 shrink-0 rounded-2xl bg-foreground/[0.06]" />
          </div>
        </div>

        <div className="bg-card px-5 py-4 sm:px-6">
          <Skeleton className="needs-you-shimmer h-16 w-[85%] rounded-[18px_18px_18px_0] bg-foreground/[0.06]" />
          <Skeleton className="needs-you-shimmer mt-4 ml-auto h-20 w-[85%] rounded-[18px_18px_0_18px] bg-foreground/[0.08]" />
        </div>

        <div className="mt-auto rounded-b-3xl border-t border-border/50 bg-muted/30 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="needs-you-shimmer h-12 w-full rounded-2xl bg-foreground/[0.08]" />
            <Skeleton className="needs-you-shimmer h-12 w-full rounded-2xl bg-foreground/[0.05]" />
          </div>
        </div>
      </Card>
    </section>
  )
}
