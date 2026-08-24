"use client"

import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { effectiveRefundCap, visibleAutonomyTiers } from "@/lib/agent/autonomy-tiers"
import { SolidSettingsTile as SettingsTile } from "@/app/dashboard/(shell)/settings/_components/SettingsTile"
import { cn } from "@/lib/ui/cn"
import { tierDefaultForPath } from "./agent-tab-helpers"
import type { AgentTabController } from "./useAgentTabState"

export function AgentAutonomySection({ controller }: { controller: AgentTabController }) {
  const {
    settingsState,
    payload,
    explicitOverrideSet,
    selectTier,
  } = controller

  const tierOptions = visibleAutonomyTiers()
  const refundOverride = explicitOverrideSet.has("maxRefundAmount") ? payload.maxRefundAmount : null

  return (
    <SettingsTile
      id="autonomy"
      label="Trust level"
    >
      <div className="space-y-3">
        <p>How much {AGENT_DISPLAY_NAME} can do before asking you. Most stores stay on Ask first.</p>
        <div
          role="radiogroup"
          aria-label="Trust level"
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
        >
          {tierOptions.map((option) => {
            const selected = settingsState.autonomyTier === option.id
            const tierActs = tierDefaultForPath(option.id, "toolsEnabled.action") !== false
            const cap = tierActs
              ? effectiveRefundCap({ autonomyTier: option.id, maxRefundAmount: refundOverride })
              : option.cap
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => selectTier(option.id)}
                className={cn(
                  "min-h-[104px] rounded-xl border p-3 text-left transition-all",
                  selected
                    ? "border-foreground/[0.40] bg-foreground/[0.07]"
                    : "border-foreground/[0.10] bg-foreground/[0.025] hover:border-foreground/[0.22] hover:bg-foreground/[0.05]",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("size-2.5 rounded-full border", selected ? "border-foreground bg-foreground" : "border-foreground/25")} />
                  <span className="text-sm font-semibold text-strong">{option.label}</span>
                  {option.recommended ? (
                    <span className="rounded-sm border border-emerald-700/25 bg-emerald-700/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-emerald-700">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-faint">{option.blurb}</p>
                <p className="mt-2 font-mono text-xs uppercase tracking-[0.06em] text-faint">Refund cap ${cap}</p>
                {cap !== option.cap ? (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-faint">Your limit · tier default ${option.cap}</p>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </SettingsTile>
  )
}
