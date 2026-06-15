"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { AUTONOMY_TIERS, visibleAutonomyTiers } from "@/lib/agent/autonomy-tiers"
import type { AutonomyTier } from "@shopkeeper/agent/settings"
import type { OrgSettings } from "@/types"
import {
  readSettingsPath,
  tierDefaultForPath,
  type AutonomyOverridePath,
} from "./agent-tab-helpers"
import { MoneyInput } from "./settings-form-fields"
import { SectionCard, ToggleRow } from "./shared"
import type { AgentTabController } from "./useAgentTabState"

function tierLabel(tier: AutonomyTier): string {
  return AUTONOMY_TIERS.find(option => option.id === tier)?.label ?? tier
}

function formatOverrideValue(path: AutonomyOverridePath, value: unknown): string {
  if (path === "maxRefundAmount") {
    return typeof value === "number" ? `$${value}` : "No limit"
  }
  if (typeof value === "boolean") return value ? "On" : "Off"
  return value == null ? "Not set" : String(value)
}

function OverrideHint({
  path,
  tier,
  payload,
  explicitOverrideSet,
  onReset,
}: {
  path: AutonomyOverridePath
  tier: AutonomyTier
  payload: OrgSettings
  explicitOverrideSet: Set<AutonomyOverridePath>
  onReset: (path: AutonomyOverridePath) => void
}) {
  const explicit = explicitOverrideSet.has(path)
  const defaultValue = formatOverrideValue(path, tierDefaultForPath(tier, path))
  const currentValue = formatOverrideValue(path, readSettingsPath(payload, path))

  return (
    <p className="text-xs text-white/30">
      Default for {tierLabel(tier)}: {defaultValue}
      {explicit ? (
        <>
          <span> · You set: {currentValue}</span>
          <button
            type="button"
            onClick={() => onReset(path)}
            className="ml-2 font-semibold text-amber-300 hover:text-amber-200"
          >
            Reset to tier default
          </button>
        </>
      ) : (
        <span> · Using tier default</span>
      )}
    </p>
  )
}

const TOOL_PERMISSION_ROWS: Array<{
  path: AutonomyOverridePath
  label: string
  description: string
  badge: string
  badgeColor: string
}> = [
  {
    path: "toolsEnabled.action",
    label: "Actions",
    description: "Shopify write operations: issue refunds, cancel orders, update shipping addresses, add Shopify notes.",
    badge: "High impact",
    badgeColor: "text-orange-300 bg-orange-400/10 border-orange-400/25",
  },
  {
    path: "toolsEnabled.communication",
    label: "Communication",
    description: "Send replies to customers on their channel.",
    badge: "Customer-facing",
    badgeColor: "text-blue-300 bg-blue-400/10 border-blue-400/25",
  },
  {
    path: "toolsEnabled.internal",
    label: "Internal",
    description: "Add internal notes, update ticket status, and update ticket tags.",
    badge: "Internal",
    badgeColor: "text-violet-300 bg-violet-400/10 border-violet-400/25",
  },
  {
    path: "toolsEnabled.read",
    label: "Read",
    description: "Fetch Shopify customer profiles and order history. Read-only.",
    badge: "Read-only",
    badgeColor: "text-white/50 bg-white/[0.05] border-white/[0.10]",
  },
]

export function AgentAutonomySection({ controller }: { controller: AgentTabController }) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const {
    settingsState,
    payload,
    explicitOverrideSet,
    autonomyTier,
    maxRefundInput,
    markExplicit,
    resetAutonomyOverride,
    selectTier,
    setAutonomyOverride,
    setMaxRefundInput,
  } = controller

  const tierOptions = visibleAutonomyTiers(settingsState.autonomyTier)

  return (
    <div id="autonomy" className="scroll-mt-4">
      <SectionCard
        title="Trust level"
        description={`How much ${settingsState.agentName} can do before asking you. Most stores stay on Ask first.`}
      >
        <div className="space-y-6">
          <div role="radiogroup" aria-label="Trust level" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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
                      ? "border-white/[0.40] bg-white/[0.07]"
                      : "border-white/[0.10] bg-white/[0.025] hover:border-white/[0.22] hover:bg-white/[0.05]"
                  } ${disabled ? "opacity-45 cursor-not-allowed hover:border-white/[0.10] hover:bg-white/[0.025]" : ""}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`size-2.5 rounded-full border ${selected ? "border-white bg-white" : "border-white/25"}`} />
                    <span className="text-sm font-semibold text-white/75">{option.label}</span>
                    {option.recommended && (
                      <span className="rounded-sm border border-emerald-300/25 bg-emerald-300/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-emerald-300">
                        Recommended
                      </span>
                    )}
                    {option.comingSoon && (
                      <span className="rounded-sm border border-white/[0.12] bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-white/45">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/40">{option.blurb}</p>
                  {option.merchantFacing && (
                    <p className="mt-2 font-mono text-xs uppercase tracking-[0.06em] text-white/30">Refund cap ${option.cap}</p>
                  )}
                </button>
              )
            })}
          </div>

          <div className="border-t border-white/[0.08] pt-4">
            <button
              type="button"
              onClick={() => setAdvancedOpen(value => !value)}
              aria-expanded={advancedOpen}
              className="flex w-full items-center gap-2 text-left text-sm font-semibold text-white/55 hover:text-white/75 transition-colors"
            >
              <ChevronRight
                className={`size-4 shrink-0 text-white/40 transition-transform ${advancedOpen ? "rotate-90" : ""}`}
              />
              Advanced overrides
            </button>
            <p className="text-xs text-white/30 mt-1 ml-6">
              Per-tool permissions and limits. Only change these if the presets above do not fit your store.
            </p>

            {advancedOpen && (
              <div className="space-y-5 mt-5 border-t border-white/[0.06] pt-5">
                <div className="space-y-1">
                  <ToggleRow
                    label="Require approval before executing actions"
                    description="Show a plan card and wait for your confirmation before the agent runs Shopify or communication actions."
                    checked={settingsState.requireApprovalForActions}
                    onChange={v => setAutonomyOverride("requireApprovalForActions", v)}
                  />
                  <OverrideHint
                    path="requireApprovalForActions"
                    tier={autonomyTier}
                    payload={payload}
                    explicitOverrideSet={explicitOverrideSet}
                    onReset={resetAutonomyOverride}
                  />
                </div>

                <div className="space-y-1.5">
                  <MoneyInput
                    label="Max refund amount"
                    hint="leave blank for no limit"
                    aria-label="Max refund amount"
                    value={maxRefundInput}
                    onValueChange={value => {
                      markExplicit("maxRefundAmount")
                      setMaxRefundInput(value)
                    }}
                    placeholder="e.g. 50"
                  />
                  <OverrideHint
                    path="maxRefundAmount"
                    tier={autonomyTier}
                    payload={payload}
                    explicitOverrideSet={explicitOverrideSet}
                    onReset={resetAutonomyOverride}
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-white/60">Tool permissions</p>
                    <p className="text-xs text-white/30 mt-0.5">Override which tool categories this tier can use.</p>
                  </div>
                  <div className="space-y-4">
                    {TOOL_PERMISSION_ROWS.map(row => (
                      <div key={row.path} className="space-y-1">
                        <ToggleRow
                          label={row.label}
                          description={row.description}
                          checked={Boolean(readSettingsPath(settingsState, row.path))}
                          onChange={v => setAutonomyOverride(row.path, v)}
                          badge={row.badge}
                          badgeColor={row.badgeColor}
                        />
                        <OverrideHint
                          path={row.path}
                          tier={autonomyTier}
                          payload={payload}
                          explicitOverrideSet={explicitOverrideSet}
                          onReset={resetAutonomyOverride}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <ToggleRow
                    label="Block order cancellations"
                    description="Prevent the agent from cancelling orders entirely. Cancellations will require manual handling."
                    checked={settingsState.blockCancellations}
                    onChange={v => setAutonomyOverride("blockCancellations", v)}
                  />
                  <OverrideHint
                    path="blockCancellations"
                    tier={autonomyTier}
                    payload={payload}
                    explicitOverrideSet={explicitOverrideSet}
                    onReset={resetAutonomyOverride}
                  />
                </div>

                <div className="space-y-1">
                  <ToggleRow
                    label="Block custom line items"
                    description="Require a Shopify variant ID on all new orders. Prevents the agent from creating orders with ad-hoc line items."
                    checked={settingsState.blockCustomLineItems}
                    onChange={v => setAutonomyOverride("blockCustomLineItems", v)}
                  />
                  <OverrideHint
                    path="blockCustomLineItems"
                    tier={autonomyTier}
                    payload={payload}
                    explicitOverrideSet={explicitOverrideSet}
                    onReset={resetAutonomyOverride}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
