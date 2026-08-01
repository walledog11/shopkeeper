"use client"

import { SectionCard, ToggleRow } from "@/components/settings-form/shared"
import type { AgentTabController } from "./useAgentTabState"

export function ProactiveMonitoringSection({
  controller,
}: {
  controller: AgentTabController
}) {
  const { settingsState, dispatch } = controller
  const agentName = settingsState.agentName

  return (
    <>
      <SectionCard
        title="Proactive shipping alerts"
        description={`Hourly USPS tracking checks for stalled shipments and delivery exceptions. When something looks off, ${agentName} drafts a proactive customer heads-up for your approval — nothing sends automatically.`}
        variant="board"
      >
        <ToggleRow
          label="Delivery-exception watch"
          description="A stalled or excepted shipment surfaces an approval plan on the customer's open ticket, or reaches you directly when there is no ticket yet."
          checked={settingsState.deliveryExceptionWatchEnabled !== false}
          onChange={(value) => {
            dispatch({
              type: "set",
              patch: { deliveryExceptionWatchEnabled: value },
            })
          }}
        />
      </SectionCard>
      <SectionCard
        title="Post-resolution check-ins"
        description={`A few days after a refund or exchange ticket closes, ${agentName} nudges you to check back in with the customer. Nothing sends automatically — you reply and it drafts the note.`}
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
    </>
  )
}
