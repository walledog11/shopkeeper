const ROW_KEYS = ["member-skeleton-1", "member-skeleton-2", "member-skeleton-3"]

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading team" className="h-full overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-5 md:py-7 space-y-6 pb-10">
        <div className="flex items-center justify-end">
          <div className="h-9 w-32 animate-pulse rounded-md bg-foreground/[0.08]" />
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <div className="h-4 w-20 animate-pulse rounded bg-foreground/[0.07]" />
          </div>
          <div className="divide-y divide-border">
            {ROW_KEYS.map(key => (
              <div key={key} className="flex animate-pulse items-center gap-3 px-5 py-3.5">
                <div className="size-9 shrink-0 rounded-full bg-foreground/[0.08]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3.5 w-40 rounded bg-foreground/[0.07]" />
                  <div className="h-3 w-56 rounded bg-foreground/[0.04]" />
                </div>
                <div className="h-5 w-16 shrink-0 rounded bg-foreground/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
