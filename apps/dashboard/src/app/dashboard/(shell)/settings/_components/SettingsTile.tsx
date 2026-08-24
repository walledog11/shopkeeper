import type { ReactNode } from "react"
import { GLASS_SETTINGS_TILE, SOLID_SETTINGS_TILE } from "@/lib/ui/glass-card-styles"
import { cn } from "@/lib/ui/cn"

export const settingsFieldClassName =
  "h-9 text-sm bg-foreground/[0.06] border-foreground/[0.12] text-strong placeholder:text-faint"

export const settingsTextareaClassName =
  "text-sm bg-foreground/[0.06] border-foreground/[0.12] text-strong placeholder:text-faint"

type SettingsTileProps = {
  action?: ReactNode
  children?: ReactNode
  className?: string
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
  id,
  label,
  variant = "solid",
}: SettingsTileProps) {
  return (
    <div
      id={id}
      className={cn(
        variant === "solid" ? SOLID_SETTINGS_TILE : GLASS_SETTINGS_TILE,
        "flex flex-col items-stretch gap-3",
        id && "scroll-mt-6",
        className,
      )}
    >
      <p className="text-sm font-semibold text-strong">{label}</p>
      {children ? (
        <div className="min-w-0 text-sm text-muted-foreground">{children}</div>
      ) : null}
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </div>
  )
}
