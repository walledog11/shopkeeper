"use client"

import { NumberInput } from "./settings-form-fields"
import { SectionCard, ToggleRow } from "@/components/settings-form/shared"
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
    <SectionCard
      title="Morning briefing extras"
      description="Optional Shopify lines added to the operator digest you get on Telegram or iMessage."
      variant="board"
    >
      <div className="space-y-6">
        <ToggleRow
          label="Sales pulse"
          description="Adds orders and revenue since your last briefing, with a prior-week comparison when available."
          checked={settingsState.salesPulseEnabled !== false}
          onChange={(value) => {
            dispatch({
              type: "set",
              patch: { salesPulseEnabled: value },
            })
          }}
        />

        <div className="space-y-4 border-t border-foreground/[0.08] pt-6">
          <ToggleRow
            label="Low-stock alerts"
            description="Adds a line when variant inventory is at or below your threshold. Leave off if you do not want inventory called out in the digest."
            checked={lowStockEnabled}
            onChange={(value) => {
              if (value) {
                setLowStockThresholdInput((current) => (current.trim() === "" ? "5" : current))
              } else {
                setLowStockThresholdInput("")
              }
            }}
          />

          {lowStockEnabled && (
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
          )}
        </div>
      </div>
    </SectionCard>
  )
}
