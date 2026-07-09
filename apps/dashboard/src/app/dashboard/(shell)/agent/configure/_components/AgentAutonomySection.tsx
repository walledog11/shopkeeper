"use client"

import { visibleAutonomyTiers } from "@/lib/agent/autonomy-tiers"
import { SectionCard } from "@/components/settings-form/shared"
import type { AgentTabController } from "./useAgentTabState"

export function AgentAutonomySection({ controller }: { controller: AgentTabController }) {
  const {
    settingsState,
    selectTier,
  } = controller

  const tierOptions = visibleAutonomyTiers(settingsState.autonomyTier)

  return (
    <div id="autonomy" className="scroll-mt-4">
      <SectionCard
        title="Trust level"
        description={`How much ${settingsState.agentName} can do before asking you. Most stores stay on Ask first.`}
        variant="board"
      >
        <div
          role="radiogroup"
          aria-label="Trust level"
          className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
        >
          {tierOptions.map(option => {
            const selected = settingsState.autonomyTier === option.id
            const disabled = option.comingSoon
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => selectTier(option.id)}
                className={`min-h-[104px] rounded-md border p-3 text-left transition-all ${
                  selected
                    ? "border-foreground/[0.40] bg-foreground/[0.07]"
                    : "border-foreground/[0.10] bg-foreground/[0.025] hover:border-foreground/[0.22] hover:bg-foreground/[0.05]"
                } ${disabled ? "opacity-45 cursor-not-allowed hover:border-foreground/[0.10] hover:bg-foreground/[0.025]" : ""}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`size-2.5 rounded-full border ${selected ? "border-white bg-white" : "border-foreground/25"}`} />
                  <span className="text-sm font-semibold text-strong">{option.label}</span>
                  {option.recommended && (
                    <span className="rounded-sm border border-emerald-300/25 bg-emerald-300/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-emerald-300">
                      Recommended
                    </span>
                  )}
                  {option.comingSoon && (
                    <span className="rounded-sm border border-foreground/[0.12] bg-foreground/[0.05] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-faint">{option.blurb}</p>
                {option.merchantFacing && (
                  <p className="mt-2 font-mono text-xs uppercase tracking-[0.06em] text-faint">Refund cap ${option.cap}</p>
                )}
              </button>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}
