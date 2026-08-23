import { SearchFilterBarSkeleton } from "@/components/ui/search-filter-bar"

interface GlassToolbarSkeletonProps {
  withTabs?: boolean
  withAction?: boolean
  wrapperClassName?: string
  shellClassName?: string
}

export function GlassToolbarSkeleton({
  withTabs = false,
  withAction = false,
  wrapperClassName = "relative z-20 shrink-0 px-3 pb-3 pt-3",
}: GlassToolbarSkeletonProps) {
  return (
    <div className={wrapperClassName}>
      <SearchFilterBarSkeleton pills={withTabs ? 2 : 0} trailing={withAction} />
    </div>
  )
}
