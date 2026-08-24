import { cn } from "@/lib/ui/cn"

export type BoardCardVariant = "default" | "briefing" | "shell"

/** Soft elevation used on home cards, meta pills, and bubbles. */
export const boardSoftShadowClassName =
  "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_18px_rgba(0,0,0,0.08)]"

export const boardMetaPillShellClassName = cn(
  "flex h-10 items-center justify-center overflow-hidden rounded-2xl",
  boardSoftShadowClassName,
)

export const boardMetaPillClassName = cn(boardMetaPillShellClassName, "bg-white")

export function boardCardShadowClassName(variant: BoardCardVariant = "default") {
  if (variant === "briefing") {
    return "shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_16px_rgba(0,0,0,0.04)]"
  }
  return "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]"
}

export function boardCardShellClassName(variant: BoardCardVariant = "default") {
  return cn(
    "relative isolate overflow-hidden rounded-3xl border border-border bg-card",
    boardCardShadowClassName(variant),
    variant === "shell" && "brightness-[0.98] saturate-[0.96]",
  )
}

export const boardCardFooterClassName =
  "border-t border-border/50 bg-muted/30 rounded-b-3xl"

export const boardSecondaryButtonClassName =
  "inline-flex w-full items-center justify-center rounded-2xl border border-border bg-transparent py-3.5 text-base font-semibold text-muted-foreground transition-colors hover:bg-foreground/[0.04] disabled:opacity-40"
