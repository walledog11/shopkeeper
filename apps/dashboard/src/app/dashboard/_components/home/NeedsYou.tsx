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
      className="mt-10 flex flex-col gap-2.5"
    >
      <Card className={needsYouCardShellClassName("front")}>
        <div className="rounded-t-3xl border-b border-border/60 bg-card px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="needs-you-shimmer h-5 w-20 rounded-full bg-foreground/[0.08]" />
            <Skeleton className="needs-you-shimmer h-4 w-24 rounded-full bg-foreground/[0.06]" />
          </div>
          <div className="mt-2 space-y-2">
            <Skeleton className="needs-you-shimmer h-7 w-[86%] rounded-full bg-foreground/[0.08]" />
            <Skeleton className="needs-you-shimmer h-7 w-[58%] rounded-full bg-foreground/[0.08]" />
          </div>
        </div>

        <div className="bg-card px-5 py-4 sm:px-6">
          <div className="mt-0">
            <div className="rounded-2xl border border-border bg-muted/50 px-4 py-3 shadow-inner">
              <div className="space-y-2">
                <Skeleton className="needs-you-shimmer h-4 w-full rounded-full bg-foreground/[0.07]" />
                <Skeleton className="needs-you-shimmer h-4 w-[74%] rounded-full bg-foreground/[0.07]" />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="rounded-2xl border border-border bg-foreground/[0.04] px-4 py-3 shadow-sm">
              <div className="space-y-2">
                <Skeleton className="needs-you-shimmer h-4 w-[92%] rounded-full bg-foreground/[0.07]" />
                <Skeleton className="needs-you-shimmer h-4 w-full rounded-full bg-foreground/[0.07]" />
                <Skeleton className="needs-you-shimmer h-4 w-[56%] rounded-full bg-foreground/[0.07]" />
              </div>
            </div>
          </div>
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
