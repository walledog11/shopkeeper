"use client"

import { Input } from "@/components/ui/input"
import {
  SolidSettingsTile as SettingsTile,
  settingsFieldClassName,
} from "@/app/dashboard/(shell)/(settings)/settings/_components/SettingsTile"
import { settingsSelectClassName } from "@/components/settings-form/class-names"
import { storeTimezonePatch } from "./agent-tab-helpers"
import { TimezoneSelect } from "./TimezoneSelect"
import type { AgentTabController } from "./useAgentTabState"

export function StoreGeneralSection({ controller }: { controller: AgentTabController }) {
  const { settingsState, dispatch, businessName, setBusinessName } = controller

  return (
    <>
      <SettingsTile label="Business name">
        <div>
          <Input
            aria-label="Business name"
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            placeholder="My Store"
            className={settingsFieldClassName}
          />
        </div>
      </SettingsTile>

      <SettingsTile
        label="Store timezone"
        description="Used for business hours and briefings."
      >
        <TimezoneSelect
          aria-label="Store timezone"
          value={settingsState.businessHoursTimezone ?? ""}
          onChange={(value) => dispatch({ type: "set", patch: storeTimezonePatch(value) })}
          className={settingsSelectClassName("w-full sm:w-80")}
        />
      </SettingsTile>
    </>
  )
}
