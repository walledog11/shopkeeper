"use client"

import AgentAvatar from "@/app/dashboard/_components/agent-panel/AgentAvatar"
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
  agentName: string
  greeting: string
  firstName: string
  openContext?: AgentPanelOpenContext | null
  onChipSelect: (chip: PanelSuggestionChip) => void
}

export function BriefingNarrativeInline({ segments }: { segments: BriefingNarrativeSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "strong" ? (
          <strong key={index} className="font-semibold text-foreground tabular-nums">
            {segment.value}
          </strong>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </>
  )
}

function BriefingSkeleton() {
  return (
    <div className="flex flex-col gap-3 pb-4">
      <Skeleton className="size-10 rounded-full" />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[85%]" />
      <div className="flex flex-wrap gap-2 pt-1">
        <Skeleton className="h-7 w-36 rounded-full" />
        <Skeleton className="h-7 w-32 rounded-full" />
      </div>
    </div>
  )
}

export default function AgentPanelBriefing({
  agentName,
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
    <div className="flex flex-col gap-3 pb-4">
      <AgentAvatar agentName={agentName} size="xl" />

      <div className="space-y-1.5">
        <h2 className="font-display-serif text-xl leading-tight text-foreground">
          {greeting}, <span className="italic text-[#9c9285]">{firstName}</span>.
        </h2>
        <p className="text-sm text-foreground/60 leading-relaxed">
          <BriefingNarrativeInline segments={narrativeSegments} />
          {opsNotes.map((note, index) => (
            <span key={note.id}>
              {index === 0 ? " " : " "}
              {note.text}.
            </span>
          ))}
        </p>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => onChipSelect(chip)}
              className="px-3 py-1.5 rounded-full border border-border hover:bg-foreground/[0.04] text-xs font-semibold text-foreground/75 transition-colors text-left"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
