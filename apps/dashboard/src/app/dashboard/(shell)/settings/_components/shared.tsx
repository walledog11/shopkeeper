"use client"

import { useState, type ReactNode } from "react"
import { Check, ChevronRight, Loader2 } from "lucide-react"
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
      className="h-8 px-4 bg-foreground/[0.12] text-white hover:bg-foreground/[0.18] text-xs font-semibold disabled:opacity-40 min-w-[80px]"
    >
      {saving ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : saved ? (
        <span className="flex items-center gap-1.5"><Check className="size-3.5" /> Saved</span>
      ) : (
        "Save changes"
      )}
    </Button>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? "Disable setting" : "Enable setting"}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-amber-400' : 'bg-foreground/[0.15]'
      }`}
    >
      <span
        className={`inline-block size-3.5 rounded-full bg-white shadow transition-transform ${
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
          <p className="text-sm font-semibold text-foreground/75">{label}</p>
          {badge && (
            <Badge variant="outline" className={`text-xs font-semibold ${badgeColor}`}>
              {badge}
            </Badge>
          )}
        </div>
        <p className="text-xs text-foreground/35 mt-0.5 leading-relaxed">{description}</p>
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
    <div className="bg-card rounded-xl border border-border overflow-hidden p-5 sm:p-6 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground/75">{title}</h2>
        <p className="text-xs text-foreground/35 mt-1 leading-relaxed max-w-prose">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  )
}

export function SettingsDisclosure({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string
  description: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-5 sm:p-6 text-left transition-colors hover:bg-foreground/[0.02]"
      >
        <ChevronRight
          className={`size-4 shrink-0 mt-0.5 text-foreground/40 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground/75">{title}</h2>
          <p className="text-xs text-foreground/35 mt-1 leading-relaxed">{description}</p>
        </div>
      </button>
      {open && (
        <div className="border-t border-foreground/[0.06] px-5 sm:px-6 pb-5 sm:pb-6 pt-5 space-y-6">
          {children}
        </div>
      )}
    </div>
  )
}
