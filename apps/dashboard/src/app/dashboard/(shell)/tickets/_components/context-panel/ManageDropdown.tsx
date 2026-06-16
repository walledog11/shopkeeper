"use client"

import { useEffect, useRef, useState } from "react"
import { MoreHorizontal } from "lucide-react"
import type { ReactNode } from "react"

export interface ManageDropdownItem {
  label: string
  icon: ReactNode
  onClick: () => void | Promise<void>
  danger?: boolean
}

interface ManageDropdownProps {
  items: ManageDropdownItem[]
}

export function ManageDropdown({ items }: ManageDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex size-6 items-center justify-center rounded text-foreground/40 hover:bg-foreground/[0.05] hover:text-foreground/70 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Manage customer"
        title="Manage customer"
      >
        <MoreHorizontal className="size-3.5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-7 z-10 w-44 rounded-md border border-foreground/[0.09] bg-popover shadow-md py-1">
          {items.map(item => (
            <button
              type="button"
              key={item.label}
              onClick={() => { void item.onClick(); setOpen(false) }}
              role="menuitem"
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                item.danger
                  ? 'text-foreground/50 hover:text-red-400 hover:bg-red-400/[0.08]'
                  : 'text-foreground/60 hover:bg-foreground/[0.05]'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
