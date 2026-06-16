import { ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/ui/cn"

export function ActionRow({
  icon: Icon,
  label,
  onClick,
  destructive,
  disabled,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
        "hover:bg-foreground/[0.03] disabled:opacity-50 disabled:pointer-events-none",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", destructive ? "text-red-400" : "text-foreground/50")} strokeWidth={1.75} />
      <span className={cn("flex-1 text-sm font-medium", destructive ? "text-red-400" : "text-foreground/85")}>
        {label}
      </span>
      <ChevronRight className="size-4 text-foreground/25 shrink-0" />
    </button>
  )
}
