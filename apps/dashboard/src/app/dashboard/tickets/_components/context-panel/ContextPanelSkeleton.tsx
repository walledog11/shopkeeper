interface Props {
  hasShopify: boolean
}

export default function ContextPanelSkeleton({ hasShopify }: Props) {
  return (
    <aside className="w-full xl:w-[300px] shrink-0 xl:border-l xl:border-border flex flex-col xl:overflow-y-auto bg-background animate-pulse">
      <section className="px-3.5 pt-3 pb-3 border-b border-white/[0.08]">
        <div className="flex flex-row items-center gap-4">
          <div className="size-8 rounded-full bg-white/[0.06] shrink-0" />
          <div className="mt-1 min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-white/[0.08] rounded" />
            <div className="h-2.5 w-24 bg-white/[0.05] rounded" />
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div className="h-6 w-16 rounded border border-white/[0.08] bg-white/[0.03]" />
          {hasShopify && (
            <div className="h-6 w-20 rounded border border-white/[0.08] bg-white/[0.03]" />
          )}
        </div>
      </section>

      {hasShopify && (
        <>
          <section className="px-3.5 py-3 border-b border-white/[0.08] space-y-2">
            <div className="h-2.5 w-20 bg-white/[0.08] rounded mb-2" />
            <div className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5">
              <div className="h-2 w-16 bg-white/[0.08] rounded" />
              <div className="h-2.5 w-28 bg-white/[0.08] rounded" />
              <div className="h-2 w-32 bg-white/[0.05] rounded" />
              <div className="h-2 w-20 bg-white/[0.05] rounded" />
            </div>
          </section>

          <section className="px-3.5 py-3 border-b border-white/[0.08] space-y-2">
            <div className="h-2.5 w-16 bg-white/[0.08] rounded mb-2" />
            {["customer-skeleton-1", "customer-skeleton-2"].map(key => (
              <div key={key} className="flex items-center gap-2.5 py-1">
                <div className="size-10 rounded bg-white/[0.05] shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-2.5 w-24 bg-white/[0.06] rounded" />
                  <div className="h-2 w-16 bg-white/[0.05] rounded" />
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      <section className="px-3.5 py-3">
        <div className="h-2.5 w-24 bg-white/[0.08] rounded mb-2" />
        <div className="space-y-2">
          {["memory-skeleton-1", "memory-skeleton-2", "memory-skeleton-3"].map(key => (
            <div key={key} className="flex items-start justify-between gap-2 py-1.5">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="h-2.5 w-full max-w-[180px] bg-white/[0.06] rounded" />
                <div className="h-2 w-24 bg-white/[0.04] rounded" />
              </div>
              <div className="h-2 w-8 bg-white/[0.04] rounded shrink-0" />
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}
