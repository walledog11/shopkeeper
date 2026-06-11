import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export function PermissionRow({
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
    <div className="flex items-center gap-3 px-4 py-3.5">
      <Icon className="size-[18px] text-white/50 shrink-0" strokeWidth={1.75} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white/90 leading-tight">{title}</p>
        {description ? (
          <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function PermissionActionLink({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="text-sm font-semibold text-white/90 hover:text-white transition-colors disabled:opacity-50"
      >
        {children}
      </button>
    )
  }

  return (
    <span className="text-sm font-semibold text-white/90">{children}</span>
  )
}
