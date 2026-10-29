"use client"

import Link from "next/link"
import { Switch } from "@/components/ui/switch"
import { NumberInput, SelectField } from "@/components/settings-form/fields"
import { SolidSettingsTile as SettingsTile } from "@/app/dashboard/(shell)/settings/_components/SettingsTile"
import type { OrgSettings } from "@/types"
import { HOUR_OPTIONS } from "./agent-tab-helpers"
import type { AgentTabController } from "./useAgentTabState"

type BriefingFrequency = OrgSettings["digestFrequency"]

const FREQUENCY_LABELS: Record<BriefingFrequency, string> = {
  daily: "Once a day",
  twice_daily: "Twice a day",
  every_4h: "Every 4 hours",
  every_6h: "Every 6 hours",
  every_8h: "Every 8 hours",
  every_12h: "Every 12 hours",
}

const OFFERED_FREQUENCIES: readonly BriefingFrequency[] = ["daily", "twice_daily"]

const DAYS_OPTIONS: readonly { value: OrgSettings["digestDays"]; label: string }[] = [
  { value: "every_day", label: "Every day" },
  { value: "weekdays", label: "Weekdays only" },
]

export function MorningBriefingSection({
  controller,
  phoneLinked,
  shopifyConnected,
}: {
  controller: AgentTabController
  phoneLinked: boolean
  shopifyConnected: boolean
}) {
  const {
    settingsState,
    dispatch,
    digestHourInput,
    setDigestHourInput,
    digestSecondHourInput,
    setDigestSecondHourInput,
    lowStockThresholdInput,
    setLowStockThresholdInput,
  } = controller

  const frequency = settingsState.digestFrequency
  // A schedule stored before these controls existed still shows as itself.
  const frequencyOptions = (OFFERED_FREQUENCIES.includes(frequency)
    ? OFFERED_FREQUENCIES
    : [...OFFERED_FREQUENCIES, frequency]
  ).map((value) => ({ value, label: FREQUENCY_LABELS[value] }))
  const lowStockEnabled = lowStockThresholdInput.trim() !== ""

  return (
    <>
      <SettingsTile
        id="briefing"
        label="Briefing"
        description={phoneLinked ? (
          "A text with what needs you, sent to your linked iPhone."
        ) : (
          <>
            Texted to your linked iPhone.{" "}
            <Link href="/dashboard/integrations" className="font-semibold text-strong hover:underline">
              Link one in Integrations
            </Link>{" "}
            to start getting it.
          </>
        )}
        action={
          <Switch
            checked={settingsState.digestEnabled}
            onChange={(value) => dispatch({ type: "set", patch: { digestEnabled: value } })}
            ariaLabel="Send briefings"
          />
        }
      >
        {settingsState.digestEnabled ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-4">
              <SelectField
                label="How often"
                value={frequency}
                onChange={(value) => dispatch({ type: "set", patch: { digestFrequency: value } })}
                options={frequencyOptions}
                widthClassName="w-40"
              />
              <SelectField
                label={frequency === "daily" ? "Send at" : frequency === "twice_daily" ? "First at" : "Starting at"}
                ariaLabel="Briefing time"
                value={digestHourInput}
                onChange={setDigestHourInput}
                options={HOUR_OPTIONS}
                widthClassName="w-36"
              />
              {frequency === "twice_daily" ? (
                <SelectField
                  label="Second at"
                  ariaLabel="Second briefing time"
                  value={digestSecondHourInput}
                  onChange={setDigestSecondHourInput}
                  options={HOUR_OPTIONS}
                  widthClassName="w-36"
                />
              ) : null}
              <SelectField
                label="Days"
                ariaLabel="Briefing days"
                value={settingsState.digestDays}
                onChange={(value) => dispatch({ type: "set", patch: { digestDays: value } })}
                options={DAYS_OPTIONS}
                widthClassName="w-40"
              />
            </div>
            <p className="text-xs text-faint">Times are in your store timezone.</p>
          </div>
        ) : null}
      </SettingsTile>

      {shopifyConnected ? (
        <>
          <SettingsTile
            label="Sales pulse"
            description="Adds orders and revenue since your last briefing, with a prior-week comparison when available."
            action={
              <Switch
                checked={settingsState.salesPulseEnabled !== false}
                onChange={(value) => {
                  dispatch({
                    type: "set",
                    patch: { salesPulseEnabled: value },
                  })
                }}
                ariaLabel="Sales pulse"
              />
            }
          />

          <SettingsTile
            label="Low-stock alerts"
            description="Call out variants at or below a stock threshold in your briefing."
            action={
              <Switch
                checked={lowStockEnabled}
                onChange={(value) => {
                  if (value) {
                    setLowStockThresholdInput((current) => (current.trim() === "" ? "5" : current))
                  } else {
                    setLowStockThresholdInput("")
                  }
                }}
                ariaLabel="Low-stock alerts"
              />
            }
          >
            {lowStockEnabled ? (
              <NumberInput
                label="Threshold"
                hint="units or fewer"
                value={lowStockThresholdInput}
                onValueChange={setLowStockThresholdInput}
                min={0}
                max={1000}
                inputWidthClassName="w-28"
              />
            ) : null}
          </SettingsTile>
        </>
      ) : null}
    </>
  )
}
