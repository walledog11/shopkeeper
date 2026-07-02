import type { ReactNode } from "react"
import { cn } from "@/lib/ui/cn"

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center text-center p-8 gap-3", className)}>
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-strong mb-1">{title}</p>
        {description && (
          <p className={cn("text-xs text-muted-foreground", action && "mb-3")}>{description}</p>
        )}
        {action}
      </div>
    </div>
  )
}
