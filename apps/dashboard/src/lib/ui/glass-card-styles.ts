import { cn } from "@/lib/ui/cn"

export const GLASS_CARD_SHADOW =
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_1px_2px_rgba(43,33,24,0.05),0_10px_28px_-10px_rgba(43,33,24,0.16),0_24px_56px_-18px_rgba(43,33,24,0.18)]"
export const GLASS_CARD_SHADOW_HOVER =
  "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_2px_4px_rgba(43,33,24,0.06),0_16px_36px_-12px_rgba(43,33,24,0.20),0_32px_64px_-20px_rgba(43,33,24,0.22)]"

export const GLASS_CARD_SURFACE = cn(
  "border border-white/70 bg-white/65",
  GLASS_CARD_SHADOW,
  "backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/40",
  "transition-[box-shadow,border-color] duration-200",
  "hover:border-white/85",
  GLASS_CARD_SHADOW_HOVER,
)
