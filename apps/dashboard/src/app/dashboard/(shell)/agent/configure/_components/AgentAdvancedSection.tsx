"use client"

import { AgentAutonomyAdvancedSection } from "./AgentAutonomyAdvancedSection"
import type { AgentTabController } from "./useAgentTabState"

export function AgentAdvancedSection({ controller }: { controller: AgentTabController }) {
  return <AgentAutonomyAdvancedSection controller={controller} />
}
