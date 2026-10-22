/** Merchant palette shared across inbox, orders, and context panels (aligned with --m-bg-alt). */
export const merchantInkClass = "text-[#1a1a1a]" as const
export const merchantMutedClass = "text-[#6b5d4f]" as const

export const merchantSandSurfaceClass = "bg-[#f5f4f2]" as const
export const merchantSandInkClass = "bg-[#f5f4f2] text-[#1a1a1a]" as const
export const merchantSandInkHoverClass =
  "bg-[#f5f4f2] text-[#1a1a1a] hover:bg-[#ebeae6] hover:text-[#1a1a1a]" as const
export const merchantSandHoverClass =
  "hover:bg-[#f5f4f2] hover:text-[#1a1a1a]" as const

export const merchantCautionInkClass = "bg-[#fff4e5] text-[#1a1a1a]" as const

export const merchantContactPillClass =
  "h-9 max-w-full gap-1.5 px-3 text-xs font-medium text-[#6b5d4f] bg-[#f5f4f2] hover:bg-[#ebeae6]" as const

export type MerchantMetaStatusTone = "send" | "caution" | "neutral" | "danger"

export const merchantMetaStatusPillClass: Record<MerchantMetaStatusTone, string> = {
  send: merchantSandInkClass,
  caution: merchantCautionInkClass,
  neutral: `bg-white ${merchantMutedClass}`,
  danger: "bg-[#fff4e5] text-red-800",
}
