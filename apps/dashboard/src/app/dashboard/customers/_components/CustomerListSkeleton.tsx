export function CustomerListSkeleton() {
  return (
    <div className="divide-y divide-white/[0.05] animate-pulse">
      {Array.from({ length: 10 }, (_, i) => `customer-skeleton-${i}`).map((key) => (
        <div key={key} className="flex items-center gap-3 px-5 py-3.5">
          <div className="size-9 rounded-full bg-white/[0.07]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-white/[0.07] rounded" />
            <div className="h-2.5 w-44 bg-white/[0.04] rounded" />
          </div>
          <div className="hidden md:block h-2.5 w-16 bg-white/[0.05] rounded" />
          <div className="h-2.5 w-12 bg-white/[0.06] rounded" />
        </div>
      ))}
    </div>
  )
}
