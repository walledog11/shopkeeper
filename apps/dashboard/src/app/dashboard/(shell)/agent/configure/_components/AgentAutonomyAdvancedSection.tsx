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
import { presentLlmSpend, type LlmSpendSnapshot } from "./llm-spend-presentation"

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

export function AgentAutonomyAdvancedSection({
  controller,
  llmSpend,
}: {
  controller: AgentTabController
  llmSpend: LlmSpendSnapshot
}) {
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
    dailyLLMSpendCapInput,
    setDailyLLMSpendCapInput,
  } = controller
  const parsedCap = Number(dailyLLMSpendCapInput)
  const capUsd = dailyLLMSpendCapInput.trim() && Number.isFinite(parsedCap) ? parsedCap : llmSpend.defaultCapUsd
  const spend = presentLlmSpend(llmSpend, capUsd)

  return (
    <>
      <SettingsTile
        label="Compensation limits"
        description="Override the caps that come with your trust level. Leave blank to use the tier default."
      >
        <div className="space-y-4">
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

      <SettingsTile label="AI usage limit">
        <div className="space-y-3">
          <MoneyInput
            label="Daily AI limit"
            hint="resets at midnight UTC"
            aria-label="Daily AI limit"
            value={dailyLLMSpendCapInput}
            onValueChange={setDailyLLMSpendCapInput}
            placeholder="20"
            description="A safety limit for model usage across the workspace. Leave blank to use the $20 default."
          />
          <div
            role="status"
            className={spend.state === "paused" || spend.state === "unavailable"
              ? "rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-700"
              : spend.state === "warning"
                ? "rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700"
                : "rounded-md bg-foreground/[0.04] px-3 py-2 text-xs text-muted-foreground"}
          >
            <p className="font-semibold">{spend.summary}</p>
            <p className="mt-0.5">{spend.detail}</p>
          </div>
        </div>
      </SettingsTile>

      <SettingsTile
        label="Block order cancellations"
        description="Prevent the agent from cancelling orders. Cancellations will require manual handling."
        action={
          <Switch
            checked={settingsState.blockCancellations}
            onChange={(value) => setAutonomyOverride("blockCancellations", value)}
            ariaLabel="Block order cancellations"
          />
        }
      >
        <div className="space-y-1.5">
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
