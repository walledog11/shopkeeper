import type { ReactNode } from "react"
import { GLASS_SETTINGS_TILE, SOLID_SETTINGS_TILE } from "@/lib/ui/glass-card-styles"
import { cn } from "@/lib/ui/cn"

const settingsControlFocus =
  "shadow-none focus-visible:border-foreground/[0.28] focus-visible:ring-2 focus-visible:ring-foreground/[0.06] focus-visible:ring-offset-0"

export const settingsFieldClassName = cn(
  "h-9 w-full rounded-xl border border-foreground/[0.10] bg-transparent text-sm text-strong placeholder:text-faint",
  settingsControlFocus,
)

export const settingsTextareaClassName = cn(
  "min-h-[5rem] w-full resize-none rounded-xl border border-foreground/[0.10] bg-transparent px-3 py-2.5 text-sm text-strong placeholder:text-faint",
  settingsControlFocus,
)

type SettingsTileProps = {
  action?: ReactNode
  children?: ReactNode
  className?: string
  description?: ReactNode
  id?: string
  label: string
  variant?: "glass" | "solid"
}

export function SolidSettingsTile(props: Omit<SettingsTileProps, "variant">) {
  return <SettingsTile {...props} variant="solid" />
}

export function SettingsTile({
  action,
  children,
  className,
  description,
  id,
  label,
  variant = "solid",
}: SettingsTileProps) {
  const hasHeaderAside = description != null || action != null

  return (
    <div
      id={id}
      className={cn(
        variant === "solid" ? SOLID_SETTINGS_TILE : GLASS_SETTINGS_TILE,
        "flex flex-col items-stretch gap-2",
        id && "scroll-mt-6",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-start gap-x-3 gap-y-1",
          hasHeaderAside && "justify-between",
        )}
      >
        <p className="shrink-0 text-sm font-semibold text-strong">{label}</p>
        {hasHeaderAside ? (
          <div className="flex min-w-0 max-w-[min(100%,40rem)] flex-1 items-start justify-end gap-3">
            {description != null ? (
              <div className="text-right text-sm leading-snug text-muted-foreground">
                {description}
              </div>
            ) : null}
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        ) : null}
      </div>
      {children ? (
        <div className="min-w-0 text-sm text-muted-foreground">{children}</div>
      ) : null}
    </div>
  )
}
