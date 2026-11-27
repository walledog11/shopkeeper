"use client"

import { Input } from "@/components/ui/input"
import {
  SettingsTile,
  settingsFieldClassName,
} from "@/app/dashboard/(shell)/(settings)/settings/_components/SettingsTile"
import { settingsSelectClassName } from "@/components/settings-form/class-names"
import { storeTimezonePatch } from "./agent-tab-helpers"
import { TimezoneSelect } from "./TimezoneSelect"
import type { AgentTabController } from "./useAgentTabState"

export function BusinessNameSection({ controller }: { controller: AgentTabController }) {
  const { businessName, setBusinessName } = controller

  return (
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
  )
}

export function StoreTimezoneSection({ controller }: { controller: AgentTabController }) {
  const { settingsState, dispatch } = controller

  return (
    <SettingsTile label="Your timezone" description="Your briefing and business hours follow it.">
      <TimezoneSelect
        aria-label="Your timezone"
        value={settingsState.businessHoursTimezone ?? ""}
        onChange={(value) => dispatch({ type: "set", patch: storeTimezonePatch(value) })}
        className={settingsSelectClassName("w-full sm:w-80")}
      />
    </SettingsTile>
  )
}
