"use client"

import { DAY_OPTIONS } from "./agent-tab-helpers"
import {
  CharacterCountTextarea,
  NumberInput,
  settingsSelectClassName,
} from "./settings-form-fields"
import { SectionCard, ToggleRow } from "./shared"
import { TimezoneSelect } from "./TimezoneSelect"
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
    <SectionCard title="Business Hours" description="Automatically send an acknowledgment to customers who message outside your working hours.">
      <div className="space-y-5">
        <ToggleRow
          label="Enable business hours"
          description="When a message arrives outside your set hours, the auto-acknowledgment is sent to the customer instead of running a plan."
          checked={settingsState.businessHoursEnabled}
          onChange={value => dispatch({ type: "set", patch: { businessHoursEnabled: value } })}
        />

        {settingsState.businessHoursEnabled && (
          <>
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-white/60">Days open</span>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => dispatch({
                      type: "set",
                      patch: {
                        businessHoursDays: settingsState.businessHoursDays.includes(value)
                          ? settingsState.businessHoursDays.filter(day => day !== value)
                          : [...settingsState.businessHoursDays, value],
                      },
                    })}
                    className={`h-8 w-12 rounded-md border text-xs font-semibold transition-all ${
                      settingsState.businessHoursDays.includes(value)
                        ? "bg-white/[0.15] text-white border-white/[0.35]"
                        : "bg-transparent border-white/[0.12] text-white/40 hover:border-white/[0.22] hover:text-white/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-end gap-4">
              <NumberInput
                label="Opens at"
                hint="hour (0–23)"
                aria-label="Business hours start"
                min={0}
                max={23}
                value={businessHoursStartInput}
                onValueChange={setBusinessHoursStartInput}
                placeholder="9"
                inputWidthClassName="w-24"
              />
              <NumberInput
                label="Closes at"
                hint="hour (0–23)"
                aria-label="Business hours end"
                min={0}
                max={23}
                value={businessHoursEndInput}
                onValueChange={setBusinessHoursEndInput}
                placeholder="17"
                inputWidthClassName="w-24"
                inputClassName={businessHoursInvalid ? "border-red-400/60" : undefined}
              />
            </div>
            {businessHoursInvalid && (
              <p className="text-xs text-red-400">Closing time must be later than opening time.</p>
            )}

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-white/60">Timezone</span>
              <TimezoneSelect
                aria-label="Business hours timezone"
                value={settingsState.businessHoursTimezone ?? ""}
                onChange={value => dispatch({ type: "set", patch: { businessHoursTimezone: value } })}
                className={settingsSelectClassName("w-80")}
              />
              <p className="text-xs text-white/30">Daylight Saving Time is handled automatically.</p>
            </div>

            <CharacterCountTextarea
              label="Auto-acknowledgment message"
              hint="max 500 characters"
              aria-label="Auto-acknowledgment message"
              value={settingsState.autoAckMessage}
              onValueChange={value => dispatch({ type: "set", patch: { autoAckMessage: value } })}
              placeholder="Thanks for reaching out! We're currently outside business hours and will get back to you soon."
              maxLength={500}
              rows={3}
            />
          </>
        )}
      </div>
    </SectionCard>
  )
}
