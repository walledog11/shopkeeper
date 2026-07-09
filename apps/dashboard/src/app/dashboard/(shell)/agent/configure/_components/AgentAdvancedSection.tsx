"use client"

import { SettingsDisclosure } from "@/components/settings-form/shared"
import { AgentAutonomyAdvancedSection } from "./AgentAutonomyAdvancedSection"
import { AgentResponseSection } from "./AgentResponseSection"
import { AgentSampleRepliesSection } from "./AgentSampleRepliesSection"
import type { AgentTabController } from "./useAgentTabState"

export function AgentAdvancedSection({ controller }: { controller: AgentTabController }) {
  return (
    <SettingsDisclosure
      title="Advanced"
      description="Sample replies, reply language, and refund limit overrides."
    >
      <AgentSampleRepliesSection controller={controller} embedded />
      <div className="border-t border-foreground/[0.06] pt-5">
        <AgentResponseSection controller={controller} embedded />
      </div>
      <div className="border-t border-foreground/[0.06] pt-5">
        <AgentAutonomyAdvancedSection controller={controller} />
      </div>
    </SettingsDisclosure>
  )
}
