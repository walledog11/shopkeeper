import { cn } from "@/lib/ui/cn"

export type BubbleTone = "action" | "reply" | "flag" | "customer"

export type NeedsYouCardVariant = "front" | "peek" | "shell"

export const BUBBLE_TONE: Record<
  BubbleTone,
  { label: string; bubble: string }
> = {
  customer: {
    label: "text-foreground/35",
    bubble: "bg-muted/50 border border-border rounded-2xl rounded-tl-md",
  },
  action: {
    label: "text-amber-700/70",
    bubble: "bg-amber-600/[0.14] border border-amber-600/25 rounded-2xl rounded-tr-md",
  },
  reply: {
    // Heavier than ChatTimeline's 0.14: here there is one agent bubble and it is
    // what Approve acts on, so it should read as kin to that button.
    label: "text-foreground/35",
    bubble: "bg-foreground/[0.18] rounded-2xl rounded-tr-md",
  },
  flag: {
    label: "text-amber-700/70",
    bubble: "bg-amber-600/[0.14] border border-amber-600/25 rounded-2xl rounded-tr-md",
  },
}

/** Inbound sits left; everything the agent produces sits right, as in ChatTimeline. */
export function isInboundTone(tone: BubbleTone): boolean {
  return tone === "customer"
}

export function needsYouCardShellClassName(variant: NeedsYouCardVariant = "front") {
  return cn(
    "relative isolate h-full w-full overflow-hidden rounded-3xl box-border flex flex-col bg-card",
    "border border-border",
    "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]",
    variant === "shell" && "brightness-[0.98] saturate-[0.96]",
  )
}
