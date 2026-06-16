"use client"

import { BusinessHoursSection } from "./BusinessHoursSection"
import { SpamFilterSection } from "./SpamFilterSection"
import { SectionCard } from "./shared"
import type { AgentTabController } from "./useAgentTabState"

export function WhenOnDutySection({ controller }: { controller: AgentTabController }) {
  return (
    <SectionCard
      title={`When ${controller.settingsState.agentName} is on duty`}
      description="Working hours and how inbound mail is handled when you're away."
    >
      <div className="space-y-8">
        <BusinessHoursSection controller={controller} embedded />
        <div className="border-t border-foreground/[0.08] pt-8">
          <SpamFilterSection controller={controller} embedded />
        </div>
      </div>
    </SectionCard>
  )
}
