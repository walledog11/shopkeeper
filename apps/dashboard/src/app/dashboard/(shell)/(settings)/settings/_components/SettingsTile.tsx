import type { ReactNode } from "react"
import { SOLID_SETTINGS_TILE } from "@/lib/ui/glass-card-styles"
import { cn } from "@/lib/ui/cn"
import {
  settingsFieldClassName,
  settingsTextareaClassName,
} from "@/components/settings-form/class-names"

export { settingsFieldClassName, settingsTextareaClassName }

type SettingsTileProps = {
  action?: ReactNode
  children?: ReactNode
  className?: string
  description?: ReactNode
  id?: string
  label: string
}

/** @deprecated Use `SettingsTile` — all tiles are solid-surface now. */
export function SolidSettingsTile(props: SettingsTileProps) {
  return <SettingsTile {...props} />
}

export function SettingsTile({
  action,
  children,
  className,
  description,
  id,
  label,
}: SettingsTileProps) {
  return (
    <div
      id={id}
      className={cn(
        SOLID_SETTINGS_TILE,
        "flex flex-col items-stretch gap-3",
        id && "scroll-mt-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-60 space-y-1">
          <p className="text-sm font-semibold text-strong">{label}</p>
          {description != null ? (
            <div className="max-w-2xl text-sm leading-snug text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? (
        <div className="min-w-0 text-sm text-muted-foreground">{children}</div>
      ) : null}
    </div>
  )
}
