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

  const deliveryExceptionAvailable = runtimeFlags?.deliveryException ?? true
  const postResolutionFollowUpAvailable = runtimeFlags?.postResolutionFollowUp ?? true

  if (!deliveryExceptionAvailable && !postResolutionFollowUpAvailable) {
    return null
  }

  return (
    <>
      {deliveryExceptionAvailable && (
        <SectionCard
          title="Proactive shipping alerts"
          description={`Hourly USPS tracking checks for stalled shipments and delivery exceptions. When something looks off, ${AGENT_DISPLAY_NAME} drafts a proactive customer heads-up for your approval — nothing sends automatically.`}
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
      )}
      {postResolutionFollowUpAvailable && (
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
      )}
    </>
  )
}
