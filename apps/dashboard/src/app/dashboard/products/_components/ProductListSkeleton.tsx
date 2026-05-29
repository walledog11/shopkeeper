export function ProductListSkeleton() {
  return (
    <div className="divide-y divide-white/[0.05] animate-pulse">
      {Array.from({ length: 12 }, (_, i) => `product-skeleton-${i}`).map((key) => (
        <div key={key} className="flex items-center gap-3 px-5 py-3.5">
          <div className="size-9 rounded-md bg-white/[0.07] shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 bg-white/[0.07] rounded" />
            <div className="h-2.5 w-24 bg-white/[0.04] rounded" />
          </div>
          <div className="hidden sm:block h-2.5 w-16 bg-white/[0.05] rounded" />
          <div className="h-5 w-16 bg-white/[0.06] rounded-full" />
        </div>
      ))}
    </div>
  )
}
