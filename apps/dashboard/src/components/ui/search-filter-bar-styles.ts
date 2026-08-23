import { cn } from "@/lib/ui/cn"
import { boardSoftShadowClassName } from "@/lib/ui/board-card-styles"

/** Shared white pill surface for the search field and filter chips. */
export const searchFilterSurfaceClassName = cn(
  "bg-white",
  boardSoftShadowClassName,
)

export const searchFilterControlClassName = cn(
  searchFilterSurfaceClassName,
  "h-10 rounded-full",
)
