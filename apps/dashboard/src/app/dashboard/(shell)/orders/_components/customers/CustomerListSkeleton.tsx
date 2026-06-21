export function CustomerListSkeleton() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }, (_, i) => `customer-skeleton-${i}`).map((key) => (
        <div key={key} className="rounded-2xl border border-border bg-card px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-full bg-foreground/[0.06]" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-foreground/[0.06]" />
              <div className="h-2.5 w-4/5 rounded bg-foreground/[0.04]" />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
            <div className="h-4 w-16 rounded bg-foreground/[0.06]" />
            <div className="h-2.5 w-12 rounded bg-foreground/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}
