import type { HomeSummary } from "@/lib/home/summary-contract"

export interface BriefingCopyInput {
  needsYouCount: number
  overnightClearedCount: number
  briefingChannels: string[]
  refundsPending: number
  vipsInQueue: number
  ordersToShip: number | null
}

export type BriefingNarrativeSegment =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }

export interface BriefingOpsNote {
  id: "refunds" | "vips" | "orders"
  count: number
  text: string
}

export interface PanelSuggestionChip {
  id: string
  label: string
  prompt: string
  autoSend: boolean
}

export interface ThreadBriefingContext {
  threadId: string
  customerName?: string
}

export function formatChannelList(channels: string[]): string {
  if (channels.length === 0) return ""
  if (channels.length === 1) return channels[0]
  if (channels.length === 2) return `${channels[0]} and ${channels[1]}`
  return `${channels.slice(0, -1).join(", ")}, and ${channels[channels.length - 1]}`
}

export function buildBriefingNarrativeSegments(input: BriefingCopyInput): BriefingNarrativeSegment[] {
  const {
    needsYouCount,
    overnightClearedCount,
    briefingChannels,
  } = input
  const channelText = formatChannelList(briefingChannels)

  if (overnightClearedCount === 0 && needsYouCount === 0) {
    return [
      {
        kind: "text",
        value: "You're all caught up — no new tickets since yesterday. I'm on duty for anything that comes in.",
      },
    ]
  }

  if (overnightClearedCount === 0) {
    return [
      { kind: "text", value: "Nothing new since yesterday, but " },
      { kind: "strong", value: `${needsYouCount} ticket${needsYouCount === 1 ? "" : "s"}` },
      { kind: "text", value: ` need${needsYouCount === 1 ? "s" : ""} your eye.` },
    ]
  }

  if (needsYouCount > 0) {
    const segments: BriefingNarrativeSegment[] = [
      { kind: "text", value: "I drafted replies for " },
      { kind: "strong", value: `${overnightClearedCount} ticket${overnightClearedCount === 1 ? "" : "s"}` },
    ]
    if (channelText) {
      segments.push({ kind: "text", value: ` across ${channelText}` })
    }
    segments.push(
      { kind: "text", value: ". " },
      { kind: "strong", value: String(needsYouCount) },
      { kind: "text", value: ` still need${needsYouCount === 1 ? "s" : ""} your eye.` },
    )
    return segments
  }

  const segments: BriefingNarrativeSegment[] = [
    { kind: "strong", value: `${overnightClearedCount} ticket${overnightClearedCount === 1 ? " is" : "s are"}` },
    { kind: "text", value: " ready for you" },
  ]
  if (channelText) {
    segments.push({ kind: "text", value: ` from ${channelText}` })
  }
  segments.push({ kind: "text", value: "." })
  return segments
}

export function buildBriefingOpsNotes(input: BriefingCopyInput): BriefingOpsNote[] {
  const notes: BriefingOpsNote[] = []

  if (input.refundsPending > 0) {
    const count = input.refundsPending
    notes.push({
      id: "refunds",
      count,
      text: `${count} refund${count === 1 ? " is" : "s are"} waiting on your call`,
    })
  }

  if (input.vipsInQueue > 0) {
    const count = input.vipsInQueue
    notes.push({
      id: "vips",
      count,
      text: `${count} repeat customer${count === 1 ? " is" : "s are"} waiting in the queue`,
    })
  }

  if (input.ordersToShip != null && input.ordersToShip > 0) {
    const count = input.ordersToShip
    notes.push({
      id: "orders",
      count,
      text: `${count} order${count === 1 ? " is" : "s are"} paid and ready to ship`,
    })
  }

  return notes
}

export function briefingInputFromSummary(
  summary: HomeSummary,
  ordersToShip: number | null = null,
): BriefingCopyInput {
  return {
    needsYouCount: summary.metrics.needsYouCount,
    overnightClearedCount: summary.metrics.overnightClearedCount,
    briefingChannels: summary.overnight.channelNames,
    refundsPending: summary.metrics.refundsPending,
    vipsInQueue: summary.metrics.vipsInQueue,
    ordersToShip,
  }
}

export function buildPanelSuggestionChips(summary: HomeSummary): PanelSuggestionChip[] {
  const { needsYouCount, openCount, refundsPending } = summary.metrics
  const chips: PanelSuggestionChip[] = []

  if (needsYouCount > 0) {
    chips.push({
      id: "approvals",
      label: `Walk me through ${needsYouCount} pending approval${needsYouCount === 1 ? "" : "s"}`,
      prompt: `Walk me through ${needsYouCount} pending approval${needsYouCount === 1 ? "" : "s"}`,
      autoSend: true,
    })
  }

  if (openCount > 0) {
    chips.push({
      id: "open-tickets",
      label: "Summarize open tickets",
      prompt: "Summarize open tickets",
      autoSend: true,
    })
  }

  if (refundsPending > 0) {
    chips.push({
      id: "refunds",
      label: "Show refunds waiting on me",
      prompt: "Show refunds waiting on me",
      autoSend: true,
    })
  }

  return chips.slice(0, 4)
}

export function buildThreadContextNarrative(context: ThreadBriefingContext): BriefingNarrativeSegment[] {
  const customer = context.customerName?.trim()
  if (customer) {
    return [{ kind: "text", value: `You're on ${customer}'s ticket — want me to draft a reply?` }]
  }
  return [{ kind: "text", value: "You're on this ticket — want me to draft a reply?" }]
}

export function buildThreadContextChips(context: ThreadBriefingContext): PanelSuggestionChip[] {
  const customer = context.customerName?.trim()
  const draftPrompt = customer
    ? `Draft a reply to ${customer} for this ticket`
    : "Draft a reply for this ticket"

  return [
    {
      id: "thread-draft-reply",
      label: customer ? `Draft a reply to ${customer}` : "Draft a reply",
      prompt: draftPrompt,
      autoSend: true,
    },
    {
      id: "thread-summarize",
      label: "Summarize this thread",
      prompt: "Summarize this thread",
      autoSend: true,
    },
  ]
}
