"use client"

import { Switch } from "@/components/ui/switch"
import { NumberInput } from "./settings-form-fields"
import { SolidSettingsTile as SettingsTile } from "@/app/dashboard/(shell)/settings/_components/SettingsTile"
import type { AgentTabController } from "./useAgentTabState"

export function MorningBriefingSection({
  controller,
}: {
  controller: AgentTabController
}) {
  const {
    settingsState,
    dispatch,
    lowStockThresholdInput,
    setLowStockThresholdInput,
  } = controller

  const lowStockEnabled = lowStockThresholdInput.trim() !== ""

  return (
    <>
      <SettingsTile
        label="Sales pulse"
        description="Adds orders and revenue since your last briefing, with a prior-week comparison when available."
        action={
          <Switch
            checked={settingsState.salesPulseEnabled !== false}
            onChange={(value) => {
              dispatch({
                type: "set",
                patch: { salesPulseEnabled: value },
              })
            }}
            ariaLabel="Sales pulse"
          />
        }
      />

      <SettingsTile
        label="Low-stock alerts"
        description="Call out variants at or below a stock threshold in your briefing."
        action={
          <Switch
            checked={lowStockEnabled}
            onChange={(value) => {
              if (value) {
                setLowStockThresholdInput((current) => (current.trim() === "" ? "5" : current))
              } else {
                setLowStockThresholdInput("")
              }
            }}
            ariaLabel="Low-stock alerts"
          />
        }
      >
        {lowStockEnabled ? (
          <NumberInput
            label="Threshold"
            hint="units or fewer"
            value={lowStockThresholdInput}
            onValueChange={setLowStockThresholdInput}
            min={0}
            max={1000}
            inputWidthClassName="w-28"
          />
        ) : null}
      </SettingsTile>
    </>
  )
}
