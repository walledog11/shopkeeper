"use client"

import { DAY_OPTIONS, HOUR_OPTIONS } from "./agent-tab-helpers"
import {
  CharacterCountTextarea,
  SelectField,
} from "@/components/settings-form/fields"
import { settingsTextareaClassName } from "@/app/dashboard/(shell)/(settings)/settings/_components/SettingsTile"
import type { AgentTabController } from "./useAgentTabState"

export function BusinessHoursSection({ controller }: { controller: AgentTabController }) {
  const {
    settingsState,
    dispatch,
    businessHoursStartInput,
    setBusinessHoursStartInput,
    businessHoursEndInput,
    setBusinessHoursEndInput,
    businessHoursInvalid,
  } = controller

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="block text-xs font-semibold text-muted-foreground">Opening days</span>
        <div className="flex flex-wrap gap-1.5">
          {DAY_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => dispatch({
                type: "set",
                patch: {
                  businessHoursDays: settingsState.businessHoursDays.includes(value)
                    ? settingsState.businessHoursDays.filter((day) => day !== value)
                    : [...settingsState.businessHoursDays, value],
                },
              })}
              className={`h-8 w-12 rounded-lg border text-xs font-semibold transition-all ${
                settingsState.businessHoursDays.includes(value)
                  ? "border-foreground/[0.35] bg-foreground/[0.15] text-foreground"
                  : "border-foreground/[0.12] bg-transparent text-faint hover:border-foreground/[0.22] hover:text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-4">
        <SelectField
          label="Opens at"
          ariaLabel="Business hours start"
          value={businessHoursStartInput}
          onChange={setBusinessHoursStartInput}
          options={HOUR_OPTIONS}
          widthClassName="w-40"
        />
        <SelectField
          label="Closes at"
          ariaLabel="Business hours end"
          value={businessHoursEndInput}
          onChange={setBusinessHoursEndInput}
          options={HOUR_OPTIONS}
          widthClassName="w-40"
          selectClassName={businessHoursInvalid ? "border-red-600/60" : undefined}
        />
      </div>
      {businessHoursInvalid ? (
        <p className="text-xs text-red-600">Opening and closing times must be different.</p>
      ) : null}

      <CharacterCountTextarea
        label="Away message"
        aria-label="Away message"
        value={settingsState.autoAckMessage}
        onValueChange={(value) => dispatch({ type: "set", patch: { autoAckMessage: value } })}
        placeholder="Thanks for reaching out! We're currently outside business hours and will get back to you soon."
        maxLength={500}
        rows={3}
        textareaClassName={settingsTextareaClassName}
      />
    </div>
  )
}
