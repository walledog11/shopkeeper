"use client"

import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { Switch } from "@/components/ui/switch"
import { SolidSettingsTile as SettingsTile } from "@/app/dashboard/(shell)/settings/_components/SettingsTile"
import type { GatewayRuntimeFlags } from "@/lib/server/gateway-runtime-flags"
import type { AgentTabController } from "./useAgentTabState"

export function ProactiveMonitoringSection({
  controller,
  runtimeFlags,
}: {
  controller: AgentTabController
  runtimeFlags: GatewayRuntimeFlags["monitors"] | null
}) {
  const { settingsState, dispatch } = controller

  const postResolutionFollowUpAvailable = runtimeFlags?.postResolutionFollowUp ?? true

  if (!postResolutionFollowUpAvailable) {
    return null
  }

  return (
    <SettingsTile
      label="Follow-up nudges"
      action={
        <Switch
          checked={settingsState.postResolutionFollowUpEnabled !== false}
          onChange={(value) => {
            dispatch({
              type: "set",
              patch: { postResolutionFollowUpEnabled: value },
            })
          }}
          ariaLabel="Follow-up nudges"
        />
      }
    >
      A few days after a refund or exchange ticket closes, {AGENT_DISPLAY_NAME} nudges you to check
      back in with the customer. Nothing sends automatically — you reply and it drafts the note.
    </SettingsTile>
  )
}
