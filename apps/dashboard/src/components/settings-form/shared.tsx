"use client"

import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  badge,
  badgeColor,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  badge?: string
  badgeColor?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground/75">{label}</p>
          {badge && (
            <Badge variant="outline" className={`text-xs font-semibold ${badgeColor}`}>
              {badge}
            </Badge>
          )}
        </div>
        {description && <p className="text-xs text-foreground/35 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={checked ? "Disable setting" : "Enable setting"}
      />
    </div>
  )
}
