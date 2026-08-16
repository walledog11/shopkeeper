import { cn } from "@/lib/ui/cn"

export type BubbleTone = "action" | "reply" | "flag" | "customer"

export type NeedsYouCardVariant = "front" | "peek" | "shell" | "briefing"

export const needsYouSoftShadowClassName =
  "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_18px_rgba(0,0,0,0.08)]"

export const needsYouMetaPillShellClassName = cn(
  "flex h-10 items-center justify-center overflow-hidden rounded-2xl",
  needsYouSoftShadowClassName,
)

export const needsYouMetaPillClassName = cn(needsYouMetaPillShellClassName, "bg-white")

export const BUBBLE_TONE: Record<BubbleTone, { bubble: string; text: string }> = {
  customer: {
    bubble: cn(
      needsYouSoftShadowClassName,
      "rounded-[18px_18px_18px_0] bg-white text-[#1a1a1a]",
    ),
    text: "text-[15px] leading-[1.4] text-[#1a1a1a]",
  },
  reply: {
    bubble: cn(
      needsYouSoftShadowClassName,
      "rounded-[18px_18px_0_18px] bg-[#1a1a1a] text-white",
    ),
    text: "text-[15px] leading-[1.4] font-medium text-white",
  },
  action: {
    bubble: cn(
      needsYouSoftShadowClassName,
      "rounded-[18px_18px_0_18px] bg-[#d4b896] text-[#1a1a1a]",
    ),
    text: "text-[15px] leading-[1.4] font-medium text-[#1a1a1a]",
  },
  flag: {
    bubble: cn(
      needsYouSoftShadowClassName,
      "rounded-[18px_18px_0_18px] bg-[#fff4e5] text-[#1a1a1a]",
    ),
    text: "text-[15px] leading-[1.4] font-medium text-[#1a1a1a]",
  },
}

/** Inbound sits left; everything the agent produces sits right. */
export function isInboundTone(tone: BubbleTone): boolean {
  return tone === "customer"
}

/** Concierge panel bubbles mirror Needs You action-plan card tones and shadows. */
export const CONCIERGE_BUBBLE = {
  user: {
    shell: cn(needsYouSoftShadowClassName, "rounded-[18px_18px_0_18px] bg-white"),
    text: BUBBLE_TONE.customer.text,
  },
  agent: {
    shell: cn(
      needsYouSoftShadowClassName,
      "rounded-[18px_18px_18px_0] bg-gradient-to-b from-[#2a2622] to-[#1a1a1a]",
    ),
    text: BUBBLE_TONE.reply.text,
  },
  agentFlag: {
    shell: cn(needsYouSoftShadowClassName, "rounded-[18px_18px_18px_0] bg-[#fff4e5]"),
    text: BUBBLE_TONE.flag.text,
  },
} as const

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
