"use client"

import { AUTONOMY_TIERS } from "@/lib/agent/autonomy-tiers"
import type { AutonomyTier } from "@shopkeeper/agent/settings"
import {
  readSettingsPath,
  tierDefaultForPath,
  type AutonomyOverridePath,
} from "./agent-tab-helpers"
import { MoneyInput } from "@/components/settings-form/fields"
import { Switch } from "@/components/ui/switch"
import { SolidSettingsTile as SettingsTile } from "@/app/dashboard/(shell)/(settings)/settings/_components/SettingsTile"
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

/** Only an override that differs from the trust level's default says so. */
function overrideHint(
  path: AutonomyOverridePath,
  { autonomyTier, payload, explicitOverrideSet, resetAutonomyOverride }: AgentTabController,
) {
  if (!explicitOverrideSet.has(path)) return null
  const defaultValue = formatOverrideValue(path, tierDefaultForPath(autonomyTier, path))
  if (formatOverrideValue(path, readSettingsPath(payload, path)) === defaultValue) return null

  return (
    <p className="text-xs text-faint">
      {tierLabel(autonomyTier)} default: {defaultValue}
      <button
        type="button"
        onClick={() => resetAutonomyOverride(path)}
        className="ml-2 font-semibold text-amber-700 hover:text-amber-800"
      >
        Reset
      </button>
    </p>
  )
}

export function ApprovalLimitsSection({ controller }: { controller: AgentTabController }) {
  const {
    settingsState,
    dispatch,
    maxRefundInput,
    markExplicit,
    setAutonomyOverride,
    setMaxRefundInput,
    dailyRefundCapInput,
    setDailyRefundCapInput,
  } = controller

  return (
    <>
      <SettingsTile
        label="Compensation limits"
        description="Refunds and gift cards. Never exceeded, even with your approval."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <MoneyInput
              label="Largest single"
              aria-label="Largest single compensation"
              value={maxRefundInput}
              onValueChange={(value) => {
                markExplicit("maxRefundAmount")
                setMaxRefundInput(value)
              }}
              placeholder="No limit"
            />
            {overrideHint("maxRefundAmount", controller)}
          </div>
          <MoneyInput
            label="Daily total"
            aria-label="Daily compensation total"
            value={dailyRefundCapInput}
            onValueChange={setDailyRefundCapInput}
            placeholder="No limit"
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
        {overrideHint("blockCancellations", controller)}
      </SettingsTile>

      <SettingsTile
        label="Block custom items on new orders"
        description="Only catalog products, at catalog prices."
        action={
          <Switch
            checked={settingsState.blockCustomLineItems}
            onChange={(value) => setAutonomyOverride("blockCustomLineItems", value)}
            ariaLabel="Block custom items on new orders"
          />
        }
      >
        {overrideHint("blockCustomLineItems", controller)}
      </SettingsTile>

      <SettingsTile
        label="Require a photo for damage claims"
        action={
          <Switch
            checked={settingsState.damageEvidence === "photo_required"}
            onChange={(value) => dispatch({ type: "set", patch: { damageEvidence: value ? "photo_required" : "off" } })}
            ariaLabel="Require a photo for damage claims"
          />
        }
      />
    </>
  )
}

export function AiUsageLimitSection({
  controller,
  llmSpend,
}: {
  controller: AgentTabController
  llmSpend: LlmSpendSnapshot
}) {
  const { dailyLLMSpendCapInput, setDailyLLMSpendCapInput } = controller
  const parsedCap = Number(dailyLLMSpendCapInput)
  const capUsd = dailyLLMSpendCapInput.trim() && Number.isFinite(parsedCap) ? parsedCap : llmSpend.defaultCapUsd
  const spend = presentLlmSpend(llmSpend, capUsd)

  return (
    <SettingsTile label="AI usage">
      <div className="space-y-3">
        <MoneyInput
          label="Daily limit"
          aria-label="Daily AI limit"
          value={dailyLLMSpendCapInput}
          onValueChange={setDailyLLMSpendCapInput}
          placeholder={String(llmSpend.defaultCapUsd)}
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
  )
}
