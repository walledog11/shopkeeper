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
        description="Adds a line when variant inventory is at or below your threshold. Leave off if you do not want inventory called out in the digest."
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
            label="Low-stock threshold"
            hint="units or fewer"
            description="Variants at or below this count are listed in the digest."
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
