import { boardCardListClassName } from "@/lib/ui/board-card-styles"

const ROW_KEYS = [
  "inbox-skeleton-1",
  "inbox-skeleton-2",
  "inbox-skeleton-3",
  "inbox-skeleton-4",
  "inbox-skeleton-5",
]

export function InboxStreamLoading() {
  return (
    <div aria-busy="true" aria-label="Loading conversations" className={boardCardListClassName}>
      {ROW_KEYS.map(key => (
        <div key={key} className="flex animate-pulse items-start gap-3 px-4 py-3 sm:px-5">
          <div className="mt-0.5 size-8 shrink-0 rounded-xl bg-foreground/[0.06]" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <div className="h-3.5 w-1/3 rounded bg-foreground/[0.06]" />
            <div className="h-3.5 w-3/5 rounded bg-foreground/[0.05]" />
            <div className="h-3 w-4/5 rounded bg-foreground/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  )
}
