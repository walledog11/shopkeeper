import type { ReactNode } from "react"

interface SectionHeaderProps {
  title: string
  action?: ReactNode
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <span className="text-[11px] font-semibold text-foreground/45 shrink-0">{title}</span>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  )
}
