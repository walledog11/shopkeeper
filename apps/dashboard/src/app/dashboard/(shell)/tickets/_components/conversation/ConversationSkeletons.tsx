export function TimelineSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="max-w-[75%] space-y-2">
        <div className="h-3 w-16 rounded bg-white/[0.07]" />
        <div className="h-3 w-56 max-w-full rounded bg-white/[0.06]" />
        <div className="h-3 w-40 max-w-full rounded bg-white/[0.05]" />
      </div>
      <div className="ml-auto max-w-[70%] space-y-2">
        <div className="ml-auto h-3 w-14 rounded bg-white/[0.07]" />
        <div className="h-3 w-52 max-w-full rounded bg-white/[0.06]" />
      </div>
      <div className="max-w-[68%] space-y-2">
        <div className="h-3 w-20 rounded bg-white/[0.07]" />
        <div className="h-3 w-48 max-w-full rounded bg-white/[0.06]" />
        <div className="h-3 w-36 max-w-full rounded bg-white/[0.05]" />
      </div>
    </div>
  )
}

export function ComposerSkeleton() {
  return (
    <div className="mobile-ticket-composer-row relative z-20 shrink-0 flex flex-col">
      <div className="bg-background border-t border-border animate-pulse">
        <div className="flex items-center gap-1 px-5 border-b border-border">
          <div className="px-3 py-2">
            <div className="h-4 w-10 rounded bg-white/[0.08]" />
          </div>
          <div className="px-3 py-2">
            <div className="h-4 w-20 rounded bg-white/[0.05]" />
          </div>
        </div>
        <div className="px-5 pt-3">
          <div className="h-[85px] w-full rounded bg-white/[0.04]" />
          <div className="flex items-center justify-end pt-3 pb-3">
            <div className="h-8 w-20 rounded-md bg-white/[0.08]" />
          </div>
        </div>
      </div>
    </div>
  )
}
