import { GreenToggle } from "./GreenToggle"

export function PermissionToggleRow({
  label,
  required,
  suffix,
  checked,
  onChange,
}: {
  label: string
  required?: boolean
  suffix?: string | null
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <div className="flex items-center gap-2 min-w-0">
        <p className="text-sm text-white/75 truncate">{label}</p>
        {required && (
          <span className="text-[9px] font-semibold text-white/35 bg-white/[0.05] border border-white/[0.08] uppercase tracking-wider rounded px-1.5 py-0.5 shrink-0">
            Required
          </span>
        )}
        {suffix && (
          <span className="text-xs text-white/35 ml-1 shrink-0">{suffix}</span>
        )}
      </div>
      <GreenToggle checked={checked} onChange={onChange} disabled={required} />
    </div>
  )
}
