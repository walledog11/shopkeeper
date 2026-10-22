import { boardSecondaryButtonClassName } from "@/lib/ui/board-card-styles"
import { cn } from "@/lib/ui/cn"

const GLASS_CARD_SHADOW =
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_1px_2px_rgba(27,26,25,0.05),0_10px_28px_-10px_rgba(27,26,25,0.16),0_24px_56px_-18px_rgba(27,26,25,0.18)]"
const GLASS_CARD_SHADOW_HOVER =
  "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_2px_4px_rgba(27,26,25,0.06),0_16px_36px_-12px_rgba(27,26,25,0.20),0_32px_64px_-20px_rgba(27,26,25,0.22)]"

export const GLASS_CARD_SURFACE = cn(
  "border border-border bg-white",
  GLASS_CARD_SHADOW,
  "backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/95",
  "transition-[box-shadow,border-color] duration-200",
  "hover:border-foreground/15",
  GLASS_CARD_SHADOW_HOVER,
)

/** Opaque white cards with the same depth as the former glass tiles. */
export const SOLID_CARD_SURFACE = cn(
  "border border-border bg-white",
  GLASS_CARD_SHADOW,
  "transition-[box-shadow,border-color] duration-200",
  "hover:border-foreground/15",
  GLASS_CARD_SHADOW_HOVER,
)

/** Opaque white settings tiles — same depth as workspace glass tiles. */
export const SOLID_SETTINGS_TILE = cn("rounded-2xl px-5 py-5", SOLID_CARD_SURFACE)

/** Row actions on account tiles — same rounded-md language as inbox / needs-you buttons. */
export const GLASS_SETTINGS_ACTION = cn(
  boardSecondaryButtonClassName,
  "h-auto min-h-10 w-full px-4 py-2.5 text-sm whitespace-nowrap sm:w-auto sm:min-w-[12.5rem]",
)

export const GLASS_SETTINGS_ACTION_DANGER = cn(
  GLASS_SETTINGS_ACTION,
  "border-red-500/30 bg-red-500/[0.06] text-red-600 hover:bg-red-500/[0.12] hover:text-red-700",
)

const GLASS_PILL_SHADOW =
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_2px_rgba(27,26,25,0.06),0_4px_12px_-2px_rgba(27,26,25,0.08),0_12px_32px_-8px_rgba(27,26,25,0.12)]"

/** Top-bar nav/search pills — hairline border reads on white page backgrounds. */
export const GLASS_PILL_SURFACE = cn(
  "dashboard-glass-pill border border-border bg-white",
  GLASS_PILL_SHADOW,
)
