import { cn } from "@/lib/ui/cn"

export type BubbleTone = "action" | "reply" | "flag" | "customer"

export type NeedsYouCardVariant = "front" | "peek" | "shell"

export const BUBBLE_TONE: Record<
  BubbleTone,
  { label: string; bubble: string }
> = {
  customer: {
    label: "text-foreground/35",
    bubble: "bg-muted/50 border-border shadow-inner",
  },
  action: {
    label: "text-amber-700/70",
    bubble:
      "bg-gradient-to-br from-amber-600/[0.12] to-amber-600/[0.04] border-amber-600/20 shadow-sm",
  },
  reply: {
    label: "text-foreground/35",
    bubble: "bg-foreground/[0.04] border-border shadow-sm",
  },
  flag: {
    label: "text-amber-700/70",
    bubble:
      "bg-gradient-to-br from-amber-600/[0.12] to-amber-600/[0.04] border-amber-600/20 shadow-sm",
  },
}

export function needsYouCardShellClassName(variant: NeedsYouCardVariant = "front") {
  return cn(
    "relative isolate h-full w-full overflow-hidden rounded-3xl box-border flex flex-col bg-card",
    "border border-border",
    "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]",
    variant === "shell" && "brightness-[0.98] saturate-[0.96]",
  )
}
