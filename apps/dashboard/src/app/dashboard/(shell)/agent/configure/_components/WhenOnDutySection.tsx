"use client"

import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { Switch } from "@/components/ui/switch"
import { SolidSettingsTile as SettingsTile } from "@/app/dashboard/(shell)/settings/_components/SettingsTile"
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
      label={`When ${AGENT_DISPLAY_NAME} is on duty`}
      action={
        <Switch
          checked={settingsState.businessHoursEnabled}
          onChange={(value) => dispatch({ type: "set", patch: { businessHoursEnabled: value } })}
          ariaLabel="Enable after-hours away message"
        />
      }
    >
      <div className="space-y-4">
        <p>Working hours and the away message customers get when you&apos;re closed.</p>
        {settingsState.businessHoursEnabled ? <BusinessHoursSection controller={controller} /> : null}
      </div>
    </SettingsTile>
  )
}
