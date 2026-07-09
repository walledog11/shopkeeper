"use client"

import { AUTONOMY_TIERS } from "@/lib/agent/autonomy-tiers"
import type { AutonomyTier } from "@shopkeeper/agent/settings"
import type { OrgSettings } from "@/types"
import {
  readSettingsPath,
  tierDefaultForPath,
  type AutonomyOverridePath,
} from "./agent-tab-helpers"
import { MoneyInput, NumberInput } from "./settings-form-fields"
import { ToggleRow } from "@/components/settings-form/shared"
import type { AgentTabController } from "./useAgentTabState"

function tierLabel(tier: AutonomyTier): string {
  return AUTONOMY_TIERS.find(option => option.id === tier)?.label ?? tier
}

function formatOverrideValue(path: AutonomyOverridePath, value: unknown): string {
  if (path === "maxRefundAmount") {
    return typeof value === "number" ? `$${value}` : "No limit"
  }
  if (path === "maxDiscountPercent") {
    return typeof value === "number" ? `${value}%` : "No limit"
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
    <p className="text-xs text-faint">
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

export function AgentAutonomyAdvancedSection({ controller }: { controller: AgentTabController }) {
  const {
    settingsState,
    payload,
    explicitOverrideSet,
    autonomyTier,
    maxRefundInput,
    markExplicit,
    resetAutonomyOverride,
    setAutonomyOverride,
    setMaxRefundInput,
    maxDiscountInput,
    setMaxDiscountInput,
    dailyRefundCapInput,
    setDailyRefundCapInput,
  } = controller

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-strong">Refund and discount limits</h3>
        <p className="text-xs text-faint mt-0.5 leading-relaxed">
          Override the caps that come with your trust level. Leave blank to use the tier default.
        </p>
      </div>

      <div className="space-y-1.5">
        <MoneyInput
          label="Max per gesture"
          hint="leave blank for no limit"
          aria-label="Max per gesture"
          value={maxRefundInput}
          onValueChange={value => {
            markExplicit("maxRefundAmount")
            setMaxRefundInput(value)
          }}
          placeholder="e.g. 50"
          description="Largest single refund, store credit, or gift card the agent can issue."
        />
        <OverrideHint
          path="maxRefundAmount"
          tier={autonomyTier}
          payload={payload}
          explicitOverrideSet={explicitOverrideSet}
          onReset={resetAutonomyOverride}
        />
      </div>

      <div className="space-y-1.5">
        <NumberInput
          label="Max discount %"
          hint="leave blank for no limit"
          aria-label="Max discount percent"
          value={maxDiscountInput}
          onValueChange={value => {
            markExplicit("maxDiscountPercent")
            setMaxDiscountInput(value)
          }}
          placeholder="e.g. 15"
          description="Largest single-use discount code the agent can issue. Set 0 to disable discounts."
        />
        <OverrideHint
          path="maxDiscountPercent"
          tier={autonomyTier}
          payload={payload}
          explicitOverrideSet={explicitOverrideSet}
          onReset={resetAutonomyOverride}
        />
      </div>

      <MoneyInput
        label="Daily goodwill cap"
        hint="leave blank for no limit"
        aria-label="Daily goodwill cap"
        value={dailyRefundCapInput}
        onValueChange={setDailyRefundCapInput}
        placeholder="e.g. 200"
        description="Total the agent can give back per day — refunds, store credit, and gift cards share this pool."
      />

      <div className="space-y-1 border-t border-foreground/[0.06] pt-5">
        <ToggleRow
          label="Block order cancellations"
          description="Prevent the agent from cancelling orders. Cancellations will require manual handling."
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
    </div>
  )
}
