"use client"

import { SelectField } from "./settings-form-fields"
import { SectionCard } from "@/components/settings-form/shared"
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

export function AgentResponseSection({
  controller,
  embedded = false,
}: {
  controller: AgentTabController
  embedded?: boolean
}) {
  const { settingsState, dispatch } = controller

  const field = (
    <SelectField
      label="Reply language"
      ariaLabel="Reply language"
      value={settingsState.replyLanguage}
      onChange={value => dispatch({ type: "set", patch: { replyLanguage: value } })}
      options={REPLY_LANGUAGE_OPTIONS}
      description="Auto-detect matches the language the customer wrote in."
    />
  )

  if (embedded) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-strong">Reply language</h3>
          <p className="text-xs text-faint mt-0.5 leading-relaxed">
            Choose a fixed language or leave on auto-detect.
          </p>
        </div>
        {field}
      </div>
    )
  }

  return (
    <SectionCard title="Response" description="How the agent formats its customer-facing messages." variant="board">
      {field}
    </SectionCard>
  )
}
