"use client"

import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { SectionCard, ToggleRow } from "@/components/settings-form/shared"
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
    <SectionCard
      title="Post-resolution check-ins"
      description={`A few days after a refund or exchange ticket closes, ${AGENT_DISPLAY_NAME} nudges you to check back in with the customer. Nothing sends automatically — you reply and it drafts the note.`}
      variant="board"
    >
      <ToggleRow
        label="Follow-up nudges"
        description="Closed refund and exchange tickets send you a reminder on your phone after the wait below."
        checked={settingsState.postResolutionFollowUpEnabled !== false}
        onChange={(value) => {
          dispatch({
            type: "set",
            patch: { postResolutionFollowUpEnabled: value },
          })
        }}
      />
    </SectionCard>
  )
}
