"use client"

import { SelectField } from "./settings-form-fields"
import { SectionCard } from "./shared"
import type { AgentTabController } from "./useAgentTabState"

const REPLY_LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "English", label: "English" },
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Italian", label: "Italian" },
  { value: "Japanese", label: "Japanese" },
  { value: "Chinese", label: "Chinese" },
  { value: "Korean", label: "Korean" },
  { value: "Arabic", label: "Arabic" },
] as const

export function AgentResponseSection({ controller }: { controller: AgentTabController }) {
  const { settingsState, dispatch } = controller

  return (
    <SectionCard title="Response" description="How the agent formats its customer-facing messages.">
      <SelectField
        label="Reply language"
        ariaLabel="Reply language"
        value={settingsState.replyLanguage}
        onChange={value => dispatch({ type: "set", patch: { replyLanguage: value } })}
        options={REPLY_LANGUAGE_OPTIONS}
        description="Auto-detect matches the language the customer wrote in."
      />
    </SectionCard>
  )
}
