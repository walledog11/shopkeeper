"use client"

import { SectionCard, ToggleRow } from "./shared"
import type { AgentTabController } from "./useAgentTabState"

export function SpamFilterSection({ controller }: { controller: AgentTabController }) {
  const { settingsState, dispatch } = controller

  return (
    <SectionCard title="Spam Filter" description="Automatically classify inbound emails. Filtered ones are hidden from your inbox and purged after 7 days unless you recover them.">
      <ToggleRow
        label="Filter spam emails"
        description="When off, every email lands in your inbox as a normal ticket."
        checked={settingsState.spamFilterEnabled ?? true}
        onChange={value => dispatch({ type: "set", patch: { spamFilterEnabled: value } })}
      />
    </SectionCard>
  )
}
