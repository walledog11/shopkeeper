import { cn } from "@/lib/ui/cn"

const settingsControlFocus =
  "shadow-none focus-visible:border-foreground/[0.28] focus-visible:ring-2 focus-visible:ring-foreground/[0.06] focus-visible:ring-offset-0"

export const settingsFieldClassName = cn(
  "h-9 w-full rounded-xl border border-foreground/[0.10] bg-transparent text-sm text-strong placeholder:text-faint",
  settingsControlFocus,
)

export const settingsTextareaClassName = cn(
  "min-h-[5rem] w-full resize-none rounded-xl border border-foreground/[0.10] bg-transparent px-3 py-2.5 text-sm text-strong placeholder:text-faint",
  settingsControlFocus,
)

const SETTINGS_SELECT_CLASS =
  "h-9 rounded-xl border border-foreground/[0.10] bg-transparent px-3 text-sm text-strong outline-none transition-all focus:border-foreground/[0.28] focus:ring-2 focus:ring-foreground/[0.06]"

export function settingsSelectClassName(...classNames: Array<string | undefined | false>) {
  return cn(SETTINGS_SELECT_CLASS, classNames)
}
