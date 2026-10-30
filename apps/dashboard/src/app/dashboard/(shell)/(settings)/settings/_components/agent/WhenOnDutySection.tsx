"use client"

import { Switch } from "@/components/ui/switch"
import { SolidSettingsTile as SettingsTile } from "@/app/dashboard/(shell)/(settings)/settings/_components/SettingsTile"
import { BusinessHoursSection } from "./BusinessHoursSection"
import type { AgentTabController } from "./useAgentTabState"

export function WhenOnDutySection({
  controller,
}: {
  controller: AgentTabController
}) {
  const { settingsState, dispatch } = controller

  return (
    <SettingsTile
      label="Business hours"
      action={
        <Switch
          checked={settingsState.businessHoursEnabled}
          onChange={(value) => dispatch({ type: "set", patch: { businessHoursEnabled: value } })}
          ariaLabel="Business hours"
        />
      }
    >
      {settingsState.businessHoursEnabled ? <BusinessHoursSection controller={controller} /> : null}
    </SettingsTile>
  )
}
