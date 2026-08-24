"use client"

import { AgentAutonomyAdvancedSection } from "./AgentAutonomyAdvancedSection"
import { AgentResponseSection } from "./AgentResponseSection"
import { AgentSampleRepliesSection } from "./AgentSampleRepliesSection"
import type { AgentTabController } from "./useAgentTabState"

export function AgentAdvancedSection({ controller }: { controller: AgentTabController }) {
  return (
    <>
      <AgentSampleRepliesSection controller={controller} />
      <AgentResponseSection controller={controller} />
      <AgentAutonomyAdvancedSection controller={controller} />
    </>
  )
}
