"use client"

import { AUTONOMY_TIERS } from "@/lib/agent/autonomy-tiers"
import type { AutonomyTier } from "@shopkeeper/agent/settings"
import type { OrgSettings } from "@/types"
import {
  readSettingsPath,
  tierDefaultForPath,
  type AutonomyOverridePath,
} from "./agent-tab-helpers"
import { MoneyInput } from "./settings-form-fields"
import { Switch } from "@/components/ui/switch"
import { SolidSettingsTile as SettingsTile } from "@/app/dashboard/(shell)/settings/_components/SettingsTile"
import type { AgentTabController } from "./useAgentTabState"

function tierLabel(tier: AutonomyTier): string {
  return AUTONOMY_TIERS.find((option) => option.id === tier)?.label ?? tier
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
    <p className="text-xs text-faint">
      Default for {tierLabel(tier)}: {defaultValue}
      {explicit ? (
        <>
          <span> · You set: {currentValue}</span>
          <button
            type="button"
            onClick={() => onReset(path)}
            className="ml-2 font-semibold text-amber-700 hover:text-amber-800"
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
    dailyRefundCapInput,
    setDailyRefundCapInput,
  } = controller

  return (
    <>
      <SettingsTile label="Compensation limits">
        <div className="space-y-4">
          <p>Override the caps that come with your trust level. Leave blank to use the tier default.</p>
          <div className="space-y-1.5">
            <MoneyInput
              label="Largest single compensation"
              hint="leave blank for no limit"
              aria-label="Largest single compensation"
              value={maxRefundInput}
              onValueChange={(value) => {
                markExplicit("maxRefundAmount")
                setMaxRefundInput(value)
              }}
              placeholder="e.g. 50"
              description="Caps each exact full refund or explicitly requested gift card."
            />
            <OverrideHint
              path="maxRefundAmount"
              tier={autonomyTier}
              payload={payload}
              explicitOverrideSet={explicitOverrideSet}
              onReset={resetAutonomyOverride}
            />
          </div>
          <MoneyInput
            label="Daily compensation limit"
            hint="leave blank for no limit"
            aria-label="Daily compensation limit"
            value={dailyRefundCapInput}
            onValueChange={setDailyRefundCapInput}
            placeholder="e.g. 200"
            description="Total the agent can issue per day across exact full refunds and gift cards."
          />
        </div>
      </SettingsTile>

      <SettingsTile
        label="Block order cancellations"
        action={
          <Switch
            checked={settingsState.blockCancellations}
            onChange={(value) => setAutonomyOverride("blockCancellations", value)}
            ariaLabel="Block order cancellations"
          />
        }
      >
        <div className="space-y-1.5">
          <p>Prevent the agent from cancelling orders. Cancellations will require manual handling.</p>
          <OverrideHint
            path="blockCancellations"
            tier={autonomyTier}
            payload={payload}
            explicitOverrideSet={explicitOverrideSet}
            onReset={resetAutonomyOverride}
          />
        </div>
      </SettingsTile>
    </>
  )
}
