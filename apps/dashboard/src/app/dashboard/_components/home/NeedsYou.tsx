"use client"

import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import { NeedsYouAllClear } from "./NeedsYouAllClear"
import { NeedsYouDeck } from "./NeedsYouDeck"

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
      <div className="flex flex-col gap-3 w-full">
        <Card className="bg-card border-border rounded-3xl shadow-sm px-5 sm:px-6 py-5">
          <Skeleton className="h-3 w-20 rounded-full bg-foreground/[0.08]" />
          <div className="mt-2 space-y-2">
            <Skeleton className="h-7 w-[86%] rounded-full bg-foreground/[0.08]" />
            <Skeleton className="h-7 w-[58%] rounded-full bg-foreground/[0.08]" />
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <Skeleton className="h-4 w-24 rounded-full bg-foreground/[0.07]" />
            <span className="shrink-0 text-foreground/20">{"\u00b7"}</span>
            <Skeleton className="h-4 w-14 rounded-full bg-foreground/[0.06]" />
            <span className="shrink-0 text-foreground/20">{"\u00b7"}</span>
            <Skeleton className="h-4 w-12 rounded-full bg-foreground/[0.06]" />
          </div>

          <div className="mt-4">
            <div className="rounded-2xl px-4 py-3 border border-border bg-foreground/[0.04]">
              <div className="space-y-2">
                <Skeleton className="h-4 w-full rounded-full bg-foreground/[0.07]" />
                <Skeleton className="h-4 w-[74%] rounded-full bg-foreground/[0.07]" />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="rounded-2xl px-4 py-3 border border-border bg-foreground/[0.04]">
              <div className="space-y-2">
                <Skeleton className="h-4 w-[92%] rounded-full bg-foreground/[0.07]" />
                <Skeleton className="h-4 w-full rounded-full bg-foreground/[0.07]" />
                <Skeleton className="h-4 w-[56%] rounded-full bg-foreground/[0.07]" />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <Skeleton className="h-12 w-full rounded-2xl bg-foreground/[0.08]" />
            <Skeleton className="h-12 w-full rounded-2xl bg-foreground/[0.05]" />
          </div>
        </Card>
      </div>
    </section>
  )
}
