"use client"

import { ToggleRow } from "@/components/settings-form/shared"
import type { AgentTabController } from "./useAgentTabState"

export function SpamFilterSection({ controller }: { controller: AgentTabController }) {
  const { settingsState, dispatch } = controller

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-strong">Spam filter</h3>
        <p className="text-xs text-faint mt-0.5 leading-relaxed">
          When on, filtered emails are hidden from your inbox and purged after 7 days unless you recover them.
        </p>
      </div>
      <ToggleRow
        label="Filter spam emails"
        checked={settingsState.spamFilterEnabled ?? true}
        onChange={value => dispatch({ type: "set", patch: { spamFilterEnabled: value } })}
      />
    </div>
  )
}
