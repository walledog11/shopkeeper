"use client"

import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { BusinessHoursSection } from "./BusinessHoursSection"
import { SectionCard } from "@/components/settings-form/shared"
import type { AgentTabController } from "./useAgentTabState"

export function WhenOnDutySection({
  controller,
}: {
  controller: AgentTabController
}) {
  return (
    <SectionCard
      title={`When ${AGENT_DISPLAY_NAME} is on duty`}
      description="Working hours and the away message customers get when you're closed."
      variant="board"
    >
      <BusinessHoursSection controller={controller} />
    </SectionCard>
  )
}
