"use client"

import { DAY_OPTIONS } from "./agent-tab-helpers"
import {
  CharacterCountTextarea,
  SelectField,
} from "./settings-form-fields"
import { settingsSelectClassName } from "./settings-form-styles"
import { SectionCard, ToggleRow } from "./shared"
import { TimezoneSelect } from "./TimezoneSelect"
import type { AgentTabController } from "./useAgentTabState"

function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM"
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:00 ${period}`
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: formatHour(hour),
}))

export function BusinessHoursSection({
  controller,
  embedded = false,
}: {
  controller: AgentTabController
  embedded?: boolean
}) {
  const {
    settingsState,
    dispatch,
    businessHoursStartInput,
    setBusinessHoursStartInput,
    businessHoursEndInput,
    setBusinessHoursEndInput,
    businessHoursInvalid,
  } = controller

  const content = (
    <div className="space-y-5">
      <ToggleRow
          label="Enable after-hours away message"
          description={`When a message arrives outside these hours, ${settingsState.agentName} holds the reply for your approval and sends the customer a quick acknowledgment.`}
          checked={settingsState.businessHoursEnabled}
          onChange={value => dispatch({ type: "set", patch: { businessHoursEnabled: value } })}
      />

      {settingsState.businessHoursEnabled && (
        <>
          <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-foreground/60">Opening days</span>
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
                        ? "bg-foreground/[0.15] text-white border-foreground/[0.35]"
                        : "bg-transparent border-foreground/[0.12] text-foreground/40 hover:border-foreground/[0.22] hover:text-foreground/60"
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
                selectClassName={businessHoursInvalid ? "border-red-400/60" : undefined}
              />
            </div>
            {businessHoursInvalid && (
              <p className="text-xs text-red-400">Opening and closing times must be different.</p>
            )}

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-foreground/60">Timezone</span>
              <TimezoneSelect
                aria-label="Business hours timezone"
                value={settingsState.businessHoursTimezone ?? ""}
                onChange={value => dispatch({ type: "set", patch: { businessHoursTimezone: value } })}
                className={settingsSelectClassName("w-80")}
              />
              <p className="text-xs text-foreground/30">Daylight Saving Time is handled automatically.</p>
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
  )

  if (embedded) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground/70">After-hours away message</h3>
          <p className="text-xs text-foreground/35 mt-0.5 leading-relaxed">
            Outside these hours, I&apos;ll hold replies for your approval and send customers a quick acknowledgment so they&apos;re not left waiting.
          </p>
        </div>
        {content}
      </div>
    )
  }

  return (
    <SectionCard title="After-hours away message" description="Outside your working hours, the agent holds replies for your approval and sends customers a quick acknowledgment. Overnight windows are supported.">
      {content}
    </SectionCard>
  )
}
