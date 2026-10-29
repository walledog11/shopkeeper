"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  activeSettingsSection,
  settingsSectionGroups,
  settingsSections,
} from "@/app/dashboard/_components/nav-items"
import { cn } from "@/lib/ui/cn"

export function SettingsNav() {
  const active = activeSettingsSection(usePathname())

  return (
    <>
      <nav aria-label="Settings" className="sticky top-0 hidden w-52 shrink-0 flex-col gap-5 pt-1 md:flex">
        {settingsSectionGroups.map(group => (
          <div key={group.heading} className="flex flex-col gap-0.5">
            <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              {group.heading}
            </p>
            {group.sections.map(section => (
              <Link
                key={section.id}
                href={section.href}
                aria-current={active?.id === section.id ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active?.id === section.id
                    ? "bg-foreground/[0.06] font-medium text-strong"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-strong",
                )}
              >
                {section.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <nav aria-label="Settings" className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 md:hidden">
        {settingsSections.map(section => (
          <Link
            key={section.id}
            href={section.href}
            aria-current={active?.id === section.id ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active?.id === section.id
                ? "border-foreground/[0.30] bg-foreground/[0.07] text-strong"
                : "border-foreground/[0.10] text-muted-foreground hover:text-strong",
            )}
          >
            {section.label}
          </Link>
        ))}
      </nav>
    </>
  )
}

export function SettingsPageTitle() {
  const section = activeSettingsSection(usePathname())
  if (!section) return null

  return <h1 className="text-lg font-semibold tracking-tight text-strong">{section.label}</h1>
}
