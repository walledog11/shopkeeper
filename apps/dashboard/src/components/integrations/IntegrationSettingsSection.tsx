import type { ReactNode } from "react"
import { cn } from "@/lib/ui/cn"

export function IntegrationSettingsSection({
  title,
  action,
  children,
  className,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-xl border border-foreground/[0.08] overflow-hidden", className)}>
      {title ? (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-foreground/[0.06]">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/35">{title}</p>
          {action}
        </div>
      ) : null}
      <div className="divide-y divide-foreground/[0.06]">{children}</div>
    </div>
  )
}
