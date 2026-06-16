import type { ReactNode } from "react"
import { cn } from "@/lib/ui/cn"

export function ConfigureSection({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("space-y-2.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {action}
      </div>
      <div className="rounded-xl border border-foreground/[0.10] bg-foreground/[0.02] overflow-hidden divide-y divide-foreground/[0.06]">
        {children}
      </div>
    </section>
  )
}
