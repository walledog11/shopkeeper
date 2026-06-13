"use client"

import { DIGEST_DAYS_OPTIONS } from "./agent-tab-helpers"
import {
  NumberInput,
  SelectField,
} from "./settings-form-fields"
import { settingsSelectClassName } from "./settings-form-styles"
import { SectionCard, ToggleRow } from "./shared"
import { TimezoneSelect } from "./TimezoneSelect"
import type { AgentTabController } from "./useAgentTabState"

const DIGEST_FREQUENCY_OPTIONS = [
  { value: "daily", label: "Once a day" },
  { value: "twice_daily", label: "Twice a day" },
  { value: "every_4h", label: "Every 4 hours" },
  { value: "every_6h", label: "Every 6 hours" },
  { value: "every_8h", label: "Every 8 hours" },
  { value: "every_12h", label: "Every 12 hours" },
] as const

export function WhatsAppDigestSection({ controller }: { controller: AgentTabController }) {
  const {
    settingsState,
    dispatch,
    digestHourInput,
    setDigestHourInput,
    digestSecondHourInput,
    setDigestSecondHourInput,
  } = controller

  const sendTimeLabel = settingsState.digestFrequency === "twice_daily" ? "First send time" : "Send time"
  const sendTimeHint = settingsState.digestFrequency.startsWith("every_")
    ? "starting hour — repeats from here"
    : "local hour (0–23)"

  return (
    <SectionCard title="WhatsApp Digest" description="Automatically send open ticket summaries to all verified team members via WhatsApp.">
      <div className="space-y-5">
        <ToggleRow
          label="Enable digest"
          description="Only sent when there are open tickets. Requires a verified WhatsApp number in Team settings."
          checked={settingsState.digestEnabled}
          onChange={v => dispatch({ type: "set", patch: { digestEnabled: v } })}
        />

        {settingsState.digestEnabled && (
          <>
            <SelectField
              label="Frequency"
              ariaLabel="Digest frequency"
              value={settingsState.digestFrequency}
              onChange={value => dispatch({ type: "set", patch: { digestFrequency: value } })}
              options={DIGEST_FREQUENCY_OPTIONS}
            />

            <div className="space-y-3">
              <NumberInput
                label={sendTimeLabel}
                hint={sendTimeHint}
                aria-label={sendTimeLabel}
                min={0}
                max={23}
                value={digestHourInput}
                onValueChange={setDigestHourInput}
                placeholder="8"
              />

              {settingsState.digestFrequency === "twice_daily" && (
                <NumberInput
                  label="Second send time"
                  hint="local hour (0–23)"
                  aria-label="Second send time"
                  min={0}
                  max={23}
                  value={digestSecondHourInput}
                  onValueChange={setDigestSecondHourInput}
                  placeholder="17"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-white/60">Days</span>
              <div className="flex gap-2">
                {DIGEST_DAYS_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => dispatch({ type: "set", patch: { digestDays: value } })}
                    className={`h-8 px-3 rounded-md border text-xs font-semibold transition-all ${
                      settingsState.digestDays === value
                        ? "bg-white/[0.15] text-white border-white/[0.35]"
                        : "bg-transparent border-white/[0.12] text-white/40 hover:border-white/[0.22] hover:text-white/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-white/60">Timezone</span>
              <TimezoneSelect
                aria-label="Digest timezone"
                value={settingsState.digestTimezone ?? ""}
                onChange={value => dispatch({ type: "set", patch: { digestTimezone: value } })}
                className={settingsSelectClassName("w-80")}
              />
              <p className="text-xs text-white/30">Daylight Saving Time is handled automatically.</p>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  )
}
