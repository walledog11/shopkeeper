"use client"

import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { BusinessHoursSection } from "./BusinessHoursSection"
import { SpamFilterSection } from "./SpamFilterSection"
import { SectionCard } from "@/components/settings-form/shared"
import type { AgentTabController } from "./useAgentTabState"

export function WhenOnDutySection({
  controller,
  emailConnected = false,
}: {
  controller: AgentTabController
  emailConnected?: boolean
}) {
  return (
    <SectionCard
      title={`When ${AGENT_DISPLAY_NAME} is on duty`}
      description="Working hours and how inbound mail is handled when you're away."
      variant="board"
    >
      <div className="space-y-8">
        <BusinessHoursSection controller={controller} />
        {emailConnected && (
          <div className="border-t border-foreground/[0.08] pt-8">
            <SpamFilterSection controller={controller} />
          </div>
        )}
      </div>
    </SectionCard>
  )
}
