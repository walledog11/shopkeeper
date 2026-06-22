"use client"

import { Skeleton } from "@/components/ui/skeleton"
import {
  buildBriefingNarrativeSegments,
  buildBriefingOpsNotes,
  buildPanelSuggestionChips,
  buildThreadContextChips,
  buildThreadContextNarrative,
  briefingInputFromSummary,
  type BriefingNarrativeSegment,
  type PanelSuggestionChip,
} from "@/lib/agent/panel-briefing"
import type { AgentPanelOpenContext } from "@/lib/agent/panel"
import { createEmptyHomeSummary } from "@/lib/home/summary-contract"
import { usePanelBriefingData } from "./usePanelBriefingData"

interface Props {
  greeting: string
  firstName: string
  openContext?: AgentPanelOpenContext | null
  onChipSelect: (chip: PanelSuggestionChip) => void
}

export function BriefingNarrativeInline({ segments }: { segments: BriefingNarrativeSegment[] }) {
  const occurrences = new Map<string, number>()

  function segmentKey(segment: BriefingNarrativeSegment) {
    const baseKey = `${segment.kind}:${segment.value}`
    const count = occurrences.get(baseKey) ?? 0
    occurrences.set(baseKey, count + 1)
    return count === 0 ? baseKey : `${baseKey}:${count}`
  }

  return (
    <>
      {segments.map((segment) =>
        segment.kind === "strong" ? (
          <strong key={segmentKey(segment)} className="font-semibold text-foreground tabular-nums">
            {segment.value}
          </strong>
        ) : (
          <span key={segmentKey(segment)}>{segment.value}</span>
        ),
      )}
    </>
  )
}

function BriefingSkeleton() {
  return (
    <div className="flex w-full flex-col gap-8 pb-4">
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[70%]" />
      </div>
      <div className="flex w-full flex-col gap-3">
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="h-10 w-full rounded-full" />
      </div>
    </div>
  )
}

export default function AgentPanelBriefing({
  greeting,
  firstName,
  openContext,
  onChipSelect,
}: Props) {
  const hasThreadContext = Boolean(openContext?.threadId)
  const { summary, ordersToShip, isLoading, hasError } = usePanelBriefingData(!hasThreadContext)
  const briefingSummary = hasError ? createEmptyHomeSummary() : summary
  const briefingInput = briefingInputFromSummary(briefingSummary, ordersToShip)

  const narrativeSegments = hasThreadContext && openContext?.threadId
    ? buildThreadContextNarrative({
        threadId: openContext.threadId,
        customerName: openContext.customerName,
      })
    : buildBriefingNarrativeSegments(briefingInput)

  const opsNotes = hasThreadContext ? [] : buildBriefingOpsNotes(briefingInput)

  const chips = hasThreadContext && openContext?.threadId
    ? buildThreadContextChips({
        threadId: openContext.threadId,
        customerName: openContext.customerName,
      })
    : buildPanelSuggestionChips(briefingSummary)

  if (!hasThreadContext && isLoading) {
    return <BriefingSkeleton />
  }

  return (
    <div className="flex w-full flex-col gap-8 pb-4">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold leading-snug text-foreground">
          {greeting}{firstName ? <>, <span className="italic text-[#9c9285]">{firstName}</span></> : ""}.
        </h2>
        <p className="text-sm text-foreground/60 leading-relaxed">
          <BriefingNarrativeInline segments={narrativeSegments} />
        </p>
        {opsNotes.map((note) => (
          <p key={note.id} className="text-sm text-foreground/60 leading-relaxed">
            {note.text}.
          </p>
        ))}
      </div>

      {chips.length > 0 && (
        <div className="flex w-full flex-col gap-3">
          {chips.map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => onChipSelect(chip)}
              className="w-full px-4 py-2.5 rounded-full border border-border hover:bg-foreground/[0.04] text-xs font-semibold text-foreground/75 transition-colors text-left whitespace-normal"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
