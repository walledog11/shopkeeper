"use client"

import { cn } from "@/lib/ui/cn"

export interface InsightsTab<T extends string> {
  id: T
  label: string
}

interface Props<T extends string> {
  tabs: readonly InsightsTab<T>[]
  active: T
  onChange: (tab: T) => void
  variant?: "light" | "dark"
  className?: string
}

export function InsightsTabBar<T extends string>({
  tabs,
  active,
  onChange,
  variant = "light",
  className,
}: Props<T>) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-lg border p-1",
        variant === "light"
          ? "border-border bg-muted/40"
          : "border-foreground/[0.08] bg-foreground/[0.03]",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "text-xs font-semibold px-3 h-7 rounded-md transition-colors",
              variant === "light"
                ? isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                : isActive
                  ? "bg-foreground/[0.12] text-white"
                  : "text-foreground/55 hover:text-foreground/80",
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
