import type { ComponentProps } from "react"
import { KNOWN_TIMEZONE_IDS, TIMEZONE_GROUPS } from "./agent-tab-helpers"

export function TimezoneSelect({
  value,
  onChange,
  className,
  ...props
}: {
  value: string
  onChange: (value: string) => void
  className?: string
} & Omit<ComponentProps<"select">, "value" | "onChange" | "className">) {
  // Show a passthrough only for legitimate IANA values outside our curated list.
  const isUnknown = value !== "" && !KNOWN_TIMEZONE_IDS.has(value) && !value.startsWith("Etc/")

  return (
    <select
      value={KNOWN_TIMEZONE_IDS.has(value) || isUnknown ? value : ""}
      onChange={event => onChange(event.target.value)}
      className={className}
      {...props}
    >
      {isUnknown && <option value={value}>{value}</option>}
      {TIMEZONE_GROUPS.map(group => (
        <optgroup key={group.label} label={group.label}>
          {group.zones.map(zone => (
            <option key={zone.id} value={zone.id}>{zone.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
