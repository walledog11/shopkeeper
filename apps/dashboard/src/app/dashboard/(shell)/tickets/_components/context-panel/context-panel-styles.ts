import { cn } from "@/lib/ui/cn"
import { needsYouSoftShadowClassName } from "@/app/dashboard/_components/home/needs-you-card-styles"

export const contextTanPanelClassName = "rounded-2xl bg-[#f5ebe0] p-3.5"

export const contextLabelClassName =
  "text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6b5d4f]"

export const contextInputClassName = cn(
  "w-full rounded-2xl bg-white px-3 text-xs font-medium text-[#1a1a1a]",
  "placeholder:text-[#6b5d4f]/50 focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10",
)

export const contextGhostButtonClassName =
  "h-9 rounded-2xl px-3 text-xs font-semibold text-[#6b5d4f] transition-colors hover:bg-white/70"

export const contextPrimaryButtonClassName = cn(
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-2xl bg-[#1a1a1a] px-3",
  "text-xs font-semibold text-white transition-colors hover:bg-[#1a1a1a]/90 disabled:opacity-40",
)

export const contextIconButtonClassName =
  "flex size-9 items-center justify-center rounded-2xl text-[#6b5d4f] transition-colors hover:bg-[#f5ebe0] hover:text-[#1a1a1a]"

export const contextMenuClassName = cn(
  needsYouSoftShadowClassName,
  "absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-2xl border border-border bg-white py-1",
)

export const contextMenuItemClassName =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[#1a1a1a] transition-colors hover:bg-[#f5ebe0]"

export const contextMenuDangerClassName =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[#6b5d4f] transition-colors hover:bg-red-600/[0.08] hover:text-red-700"

export const contextResultRowClassName = cn(
  "flex w-full items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2.5 text-left transition-colors",
  "hover:bg-white/70 disabled:opacity-60",
)
