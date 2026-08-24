import { cn } from "@/lib/ui/cn"
import { GLASS_PILL_SURFACE } from "@/lib/ui/glass-card-styles"

/** Shared chrome for search fields and filter chips — matches header search / org pill. */
export const searchFilterSurfaceClassName = cn(
  "rounded-xl",
  GLASS_PILL_SURFACE,
)

export const searchFilterControlClassName = cn(
  searchFilterSurfaceClassName,
  "flex h-12 items-center",
)

export const searchFilterMenuPanelClassName = cn(
  "w-56 rounded-xl p-2 text-sidebar-foreground",
  GLASS_PILL_SURFACE,
)

export const searchFilterMenuItemClassName =
  "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none transition-colors hover:bg-sidebar-accent/80 focus:bg-sidebar-accent/80 data-[highlighted]:bg-sidebar-accent/80"

export const searchFilterMenuItemActiveClassName =
  "bg-sidebar-accent font-medium text-sidebar-foreground"
