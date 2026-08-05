import { Pulse } from "./Pulse"

const CARD_KEYS = ["memory-skeleton-1", "memory-skeleton-2", "memory-skeleton-3", "memory-skeleton-4", "memory-skeleton-5", "memory-skeleton-6"]

export function MemoryLibrarySkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading memory" className="w-full font-sans">
      <div className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {CARD_KEYS.map(key => (
          <div
            key={key}
            className="flex animate-pulse flex-col gap-3 rounded-3xl border border-border bg-card px-5 py-5 shadow-sm"
          >
            <Pulse className="h-6 w-[72%] rounded-lg" />
            <div className="space-y-2">
              <Pulse className="h-3.5 w-full rounded-full" />
              <Pulse className="h-3.5 w-[88%] rounded-full" />
              <Pulse className="h-3.5 w-[64%] rounded-full" />
            </div>
            <div className="border-t border-border pt-3 space-y-1.5">
              <Pulse className="h-3 w-full rounded-full bg-foreground/[0.05]" />
              <Pulse className="h-3 w-[80%] rounded-full bg-foreground/[0.05]" />
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <Pulse className="h-3 w-20 rounded-full bg-foreground/[0.05]" />
              <Pulse className="h-3 w-10 rounded-full bg-foreground/[0.05]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
