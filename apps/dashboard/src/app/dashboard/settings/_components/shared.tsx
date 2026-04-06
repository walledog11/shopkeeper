import type { ReactNode } from "react"
import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function SaveButton({ saving, saved, onClick, disabled }: {
  saving: boolean
  saved: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={disabled || saving}
      className="h-8 px-4 bg-white/[0.12] text-white hover:bg-white/[0.18] text-xs font-semibold disabled:opacity-40 min-w-[80px]"
    >
      {saving ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : saved ? (
        <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Saved</span>
      ) : (
        "Save changes"
      )}
    </Button>
  )
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-violet-600' : 'bg-white/[0.15]'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  badge,
  badgeColor,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  badge?: string
  badgeColor?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-white/75">{label}</p>
          {badge && (
            <Badge variant="outline" className={`text-[10px] font-semibold ${badgeColor}`}>
              {badge}
            </Badge>
          )}
        </div>
        <p className="text-xs text-white/35 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export function SectionCard({ title, description, children }: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="bg-card rounded-md border border-border overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
        <div>
          <h2 className="text-sm font-semibold text-white/75">{title}</h2>
          <p className="text-xs text-white/35 mt-1 leading-relaxed">{description}</p>
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}
