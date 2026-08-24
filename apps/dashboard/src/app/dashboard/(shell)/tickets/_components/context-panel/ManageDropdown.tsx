"use client"

import { useEffect, useRef, useState } from "react"
import { MoreHorizontal } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/ui/cn"
import {
  contextIconButtonClassName,
  contextMenuClassName,
  contextMenuDangerClassName,
  contextMenuItemClassName,
} from "./context-panel-styles"

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
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(contextIconButtonClassName, open && "bg-[#f5ebe0] text-[#1a1a1a]")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Manage customer"
        title="Manage customer"
      >
        <MoreHorizontal className="size-3.5" />
      </button>
      {open && (
        <div role="menu" className={contextMenuClassName}>
          {items.map(item => (
            <button
              type="button"
              key={item.label}
              onClick={() => { void item.onClick(); setOpen(false) }}
              role="menuitem"
              className={item.danger ? contextMenuDangerClassName : contextMenuItemClassName}
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
