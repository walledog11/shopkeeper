import type { ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"

function SkeletonPermissionRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Skeleton className="size-[18px] shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-[88%]" />
      </div>
      <Skeleton className="h-3.5 w-16 shrink-0" />
    </div>
  )
}

function SkeletonSection({
  titleWidth,
  rows,
  children,
}: {
  titleWidth: string
  rows?: number
  children?: ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <Skeleton className={`h-5 ${titleWidth}`} />
      <div className="overflow-hidden divide-y divide-foreground/[0.06] rounded-xl border border-foreground/[0.10] bg-foreground/[0.02]">
        {children ?? Array.from({ length: rows ?? 0 }).map((_, index) => (
          <SkeletonPermissionRow key={index} />
        ))}
      </div>
    </section>
  )
}

export function GmailConfigureSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-[54px] w-full rounded-xl" />

      <SkeletonSection titleWidth="w-24" rows={3} />

      <SkeletonSection titleWidth="w-24">
        <SkeletonPermissionRow />
      </SkeletonSection>

      <SkeletonSection titleWidth="w-28">
        <div className="space-y-3 px-4 py-4 sm:px-5">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[92%]" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Skeleton className="h-10 flex-1 rounded-md" />
            <Skeleton className="h-4 w-24 shrink-0" />
          </div>
        </div>
      </SkeletonSection>

      <SkeletonSection titleWidth="w-16" rows={2} />
    </div>
  )
}
