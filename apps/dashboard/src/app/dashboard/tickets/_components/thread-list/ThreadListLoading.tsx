const ROW_KEYS = ["list-skeleton-1", "list-skeleton-2", "list-skeleton-3", "list-skeleton-4", "list-skeleton-5", "list-skeleton-6"]

export function ThreadListLoading() {
  return (
    <div className="divide-y divide-foreground/[0.06]">
      {ROW_KEYS.map(key => (
        <div key={key} className="px-4 py-3.5 animate-pulse space-y-2">
          <div className="flex justify-between gap-3">
            <div className="h-3 w-28 bg-foreground/[0.06] rounded" />
            <div className="h-3 w-8 bg-foreground/[0.04] rounded shrink-0" />
          </div>
          <div className="h-3 w-40 bg-foreground/[0.05] rounded" />
          <div className="h-3 w-56 bg-foreground/[0.04] rounded" />
        </div>
      ))}
    </div>
  )
}
