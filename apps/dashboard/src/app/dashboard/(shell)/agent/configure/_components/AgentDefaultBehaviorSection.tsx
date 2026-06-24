"use client"

import { SectionCard, ToggleRow } from "@/components/settings-form/shared"
import type { AgentTabController } from "./useAgentTabState"

export function AgentDefaultBehaviorSection({ controller }: { controller: AgentTabController }) {
  const { settingsState, dispatch } = controller

  return (
    <SectionCard title="Default Behavior" description="What the agent does automatically when a ticket is opened." variant="board">
      <ToggleRow
        label="Auto-plan on ticket open"
        description="Automatically generate an action plan when you open a ticket with an unread customer message."
        checked={settingsState.autoPlanOnOpen}
        onChange={v => dispatch({ type: "set", patch: { autoPlanOnOpen: v } })}
      />
    </SectionCard>
  )
}
