"use client"

import { settingsSelectClassName } from "./settings-form-styles"
import { SolidSettingsTile as SettingsTile } from "@/app/dashboard/(shell)/settings/_components/SettingsTile"
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
    <SettingsTile label="Reply language">
      <div className="space-y-3">
        <p>Choose a fixed language or leave on auto-detect. Auto-detect matches the language the customer wrote in.</p>
        <select
          aria-label="Reply language"
          value={settingsState.replyLanguage}
          onChange={(event) => dispatch({ type: "set", patch: { replyLanguage: event.target.value } })}
          className={settingsSelectClassName("w-full sm:w-56")}
        >
          {REPLY_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </SettingsTile>
  )
}
