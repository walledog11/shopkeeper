import { cn } from "@/lib/ui/cn"
import {
  boardCardShellClassName,
  boardCardShadowClassName,
  boardMetaPillClassName,
  boardMetaPillShellClassName,
  boardSecondaryButtonClassName,
  boardSoftShadowClassName,
  type BoardCardVariant,
} from "@/lib/ui/board-card-styles"

export type BubbleTone = "action" | "reply" | "flag" | "customer"

export type NeedsYouCardVariant = "front" | "peek" | "shell" | "briefing"

export const needsYouSoftShadowClassName = boardSoftShadowClassName

export const needsYouMetaPillShellClassName = boardMetaPillShellClassName

export const needsYouMetaPillClassName = boardMetaPillClassName

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

function toBoardCardVariant(variant: NeedsYouCardVariant): BoardCardVariant {
  if (variant === "briefing") return "briefing"
  if (variant === "shell") return "shell"
  return "default"
}

export function needsYouCardShellClassName(variant: NeedsYouCardVariant = "front") {
  return cn(
    "h-full w-full box-border flex flex-col",
    boardCardShellClassName(toBoardCardVariant(variant)),
  )
}

export const needsYouSecondaryButtonClassName = boardSecondaryButtonClassName

// Re-export for callers that need the shadow token directly.
export { boardCardShadowClassName }
