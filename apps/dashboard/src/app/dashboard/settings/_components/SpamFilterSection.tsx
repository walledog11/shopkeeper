"use client"

import { SectionCard, ToggleRow } from "./shared"
import type { AgentTabController } from "./useAgentTabState"

export function SpamFilterSection({
  controller,
  embedded = false,
}: {
  controller: AgentTabController
  embedded?: boolean
}) {
  const { settingsState, dispatch } = controller

  const toggle = (
    <ToggleRow
      label="Filter spam emails"
      description="When off, every email lands in your inbox as a normal ticket."
      checked={settingsState.spamFilterEnabled ?? true}
      onChange={value => dispatch({ type: "set", patch: { spamFilterEnabled: value } })}
    />
  )

  if (embedded) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white/70">Spam filter</h3>
          <p className="text-xs text-white/35 mt-0.5 leading-relaxed">
            When on, filtered emails are hidden from your inbox and purged after 7 days unless you recover them.
          </p>
        </div>
        {toggle}
      </div>
    )
  }

  return (
    <SectionCard title="Spam Filter" description="Automatically classify inbound emails. Filtered ones are hidden from your inbox and purged after 7 days unless you recover them.">
      {toggle}
    </SectionCard>
  )
}
