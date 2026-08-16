import { cn } from "@/lib/ui/cn"

export type BubbleTone = "action" | "reply" | "flag" | "customer"

export type NeedsYouCardVariant = "front" | "peek" | "shell" | "briefing"

const brutalBubble = "border-2 border-[#1a1a1a] shadow-[-2px_2px_0_#c4a574]"

export const needsYouMetaPillShellClassName =
  "flex h-10 items-center justify-center overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_18px_rgba(0,0,0,0.08)]"

export const needsYouMetaPillClassName = cn(needsYouMetaPillShellClassName, "bg-white")

export const BUBBLE_TONE: Record<BubbleTone, { bubble: string; text: string }> = {
  customer: {
    bubble: cn(
      brutalBubble,
      "rounded-[18px_18px_18px_0] bg-white text-[#1a1a1a]",
    ),
    text: "text-[15px] leading-[1.4] text-[#1a1a1a]",
  },
  reply: {
    bubble: cn(
      brutalBubble,
      "rounded-[18px_18px_0_18px] bg-[#1a1a1a] text-white",
    ),
    text: "text-[15px] leading-[1.4] font-medium text-white",
  },
  action: {
    bubble: cn(
      brutalBubble,
      "rounded-[18px_18px_0_18px] bg-[#d4b896] text-[#1a1a1a]",
    ),
    text: "text-[15px] leading-[1.4] font-medium text-[#1a1a1a]",
  },
  flag: {
    bubble: cn(
      brutalBubble,
      "rounded-[18px_18px_0_18px] bg-[#fff4e5] text-[#1a1a1a]",
    ),
    text: "text-[15px] leading-[1.4] font-medium text-[#1a1a1a]",
  },
}

/** Inbound sits left; everything the agent produces sits right. */
export function isInboundTone(tone: BubbleTone): boolean {
  return tone === "customer"
}

export function needsYouConversationSurfaceClassName() {
  return "bg-card"
}

export function needsYouCardShellClassName(variant: NeedsYouCardVariant = "front") {
  return cn(
    "relative isolate h-full w-full overflow-hidden rounded-3xl box-border flex flex-col bg-card",
    "border border-border",
    variant === "briefing"
      ? "shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_16px_rgba(0,0,0,0.04)]"
      : "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]",
    variant === "shell" && "brightness-[0.98] saturate-[0.96]",
  )
}

export const needsYouSecondaryButtonClassName =
  "inline-flex w-full items-center justify-center rounded-2xl border border-border bg-transparent py-3.5 text-base font-semibold text-muted-foreground transition-colors hover:bg-foreground/[0.04] disabled:opacity-40"
