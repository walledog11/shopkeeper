"use client"

import { LabeledTextInput } from "./settings-form-fields"
import { SectionCard, ToggleRow } from "./shared"
import type { AgentTabController } from "./useAgentTabState"

export function AgentDefaultBehaviorSection({ controller }: { controller: AgentTabController }) {
  const { settingsState, dispatch } = controller

  return (
    <SectionCard title="Default Behavior" description="What the agent does automatically when a ticket is opened.">
      <div className="space-y-5">
        <ToggleRow
          label="Auto-plan on ticket open"
          description="Automatically generate an action plan when you open a ticket with an unread customer message."
          checked={settingsState.autoPlanOnOpen}
          onChange={v => dispatch({ type: "set", patch: { autoPlanOnOpen: v } })}
        />
        <LabeledTextInput
          label="Default instruction"
          hint="pre-filled in the plan prompt"
          aria-label="Default instruction"
          value={settingsState.defaultInstruction}
          onChange={e => dispatch({ type: "set", patch: { defaultInstruction: e.target.value } })}
          placeholder="e.g. Resolve the customer's issue and draft a reply"
        />
      </div>
    </SectionCard>
  )
}
