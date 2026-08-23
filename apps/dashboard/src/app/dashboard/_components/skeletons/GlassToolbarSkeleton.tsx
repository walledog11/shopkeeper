import { GLASS_CONTROL_CLASS, GLASS_SHELL_CLASS } from "./styles"
import { Pulse } from "./Pulse"

interface GlassToolbarSkeletonProps {
  /** Show a pill tab group on the right (orders page). */
  withTabs?: boolean
  /** Show an action button on the right (kb page). */
  withAction?: boolean
  shellClassName?: string
  wrapperClassName?: string
}

export function GlassToolbarSkeleton({
  withTabs = false,
  withAction = false,
  shellClassName = GLASS_SHELL_CLASS,
  wrapperClassName = "relative z-20 shrink-0 px-3 pb-3 pt-3",
}: GlassToolbarSkeletonProps) {
  return (
    <div className={wrapperClassName}>
      <div className={shellClassName}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:flex-row md:items-center">
          <div className={`flex h-9 min-w-0 items-center gap-2 rounded-full px-3.5 sm:flex-1 md:flex-1 ${GLASS_CONTROL_CLASS}`}>
            <Pulse className="size-3.5 shrink-0 rounded-full" />
            <Pulse className="h-3.5 flex-1 rounded-full" />
          </div>
          {withTabs && (
            <div className={`flex h-9 items-center gap-1 rounded-full px-1 md:shrink-0 ${GLASS_CONTROL_CLASS}`}>
              <Pulse className="h-7 w-16 rounded-full" />
              <Pulse className="h-7 w-20 rounded-full" />
            </div>
          )}
          {withAction && (
            <Pulse className="h-9 w-24 shrink-0 rounded-full" />
          )}
        </div>
      </div>
    </div>
  )
}
