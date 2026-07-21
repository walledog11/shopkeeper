"use client"

import { SectionCard, ToggleRow } from "@/components/settings-form/shared"
import type { AgentTabController } from "./useAgentTabState"

export function ProactiveMonitoringSection({
  controller,
}: {
  controller: AgentTabController
}) {
  const { settingsState, dispatch } = controller

  return (
    <SectionCard
      title="Proactive shipping alerts"
      description="Hourly USPS tracking checks for stalled shipments and delivery exceptions. When something looks off, Shopkeeper drafts a proactive customer heads-up for your approval — nothing sends automatically."
      variant="board"
    >
      <ToggleRow
        label="Delivery-exception watch"
        description="Requires the gateway DELIVERY_EXCEPTION_MONITOR_ENABLED flag. When enabled here, stalled or excepted USPS shipments can surface an approval plan on the customer's open ticket, or notify you directly when no ticket exists yet."
        checked={settingsState.deliveryExceptionWatchEnabled !== false}
        onChange={(value) => {
          dispatch({
            type: "set",
            patch: { deliveryExceptionWatchEnabled: value },
          })
        }}
      />
    </SectionCard>
  )
}
