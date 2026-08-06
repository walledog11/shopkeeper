import { Pulse } from "@/app/dashboard/_components/skeletons"

const CUSTOMER_SKELETON_KEYS = [
  "customer-skeleton-0",
  "customer-skeleton-1",
  "customer-skeleton-2",
  "customer-skeleton-3",
  "customer-skeleton-4",
  "customer-skeleton-5",
  "customer-skeleton-6",
  "customer-skeleton-7",
  "customer-skeleton-8",
]

export function CustomerListSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Loading customers"
    >
      {CUSTOMER_SKELETON_KEYS.map(key => (
        <div key={key} className="rounded-2xl border border-border bg-card px-5 py-5">
          <div className="flex items-start gap-3">
            <Pulse className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Pulse className="h-3 w-2/3" />
              <Pulse className="h-2.5 w-4/5 bg-foreground/[0.04]" />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
            <Pulse className="h-4 w-16" />
            <Pulse className="h-2.5 w-12 bg-foreground/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}
