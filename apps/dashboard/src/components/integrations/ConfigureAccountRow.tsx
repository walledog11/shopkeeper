import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/ui/cn"
import { PermissionRow } from "./PermissionRow"

export function ConfigureAccountRow({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className={cn(
      "rounded-xl border border-white/[0.12] bg-white/[0.04]",
      "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
    )}>
      <PermissionRow
        icon={Icon}
        title={title}
        description={description}
        action={action}
      />
    </div>
  )
}
