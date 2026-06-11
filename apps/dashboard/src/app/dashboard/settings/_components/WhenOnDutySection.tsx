"use client"

import { BusinessHoursSection } from "./BusinessHoursSection"
import { SpamFilterSection } from "./SpamFilterSection"
import { SectionCard } from "./shared"
import type { AgentTabController } from "./useAgentTabState"

export function WhenOnDutySection({ controller }: { controller: AgentTabController }) {
  return (
    <SectionCard
      title="When I'm on duty"
      description="Set your working hours and how inbound mail is filtered when you're away."
    >
      <div className="space-y-8">
        <BusinessHoursSection controller={controller} embedded />
        <div className="border-t border-white/[0.08] pt-8">
          <SpamFilterSection controller={controller} embedded />
        </div>
      </div>
    </SectionCard>
  )
}
