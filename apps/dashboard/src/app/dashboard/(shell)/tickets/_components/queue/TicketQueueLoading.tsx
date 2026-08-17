const CARD_KEYS = ["queue-skeleton-1", "queue-skeleton-2", "queue-skeleton-3"]

export function TicketQueueLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading tickets"
      className="flex w-full flex-col gap-3"
    >
      <div className="h-4 w-32 animate-pulse rounded bg-foreground/[0.07]" />

      {CARD_KEYS.map(key => (
        <div
          key={key}
          className="flex animate-pulse flex-col gap-3 rounded-3xl border border-border bg-card px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="size-9 shrink-0 rounded-xl bg-foreground/[0.06]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="h-3.5 w-32 rounded bg-foreground/[0.07]" />
                <div className="h-3 w-10 shrink-0 rounded bg-foreground/[0.04]" />
              </div>
              <div className="h-3 w-20 rounded bg-foreground/[0.05]" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-5 w-[78%] rounded bg-foreground/[0.07]" />
            <div className="h-4 w-full rounded bg-foreground/[0.05]" />
            <div className="h-4 w-[62%] rounded bg-foreground/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}
