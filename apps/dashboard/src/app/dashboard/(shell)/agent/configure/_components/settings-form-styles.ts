import { cn } from "@/lib/ui/cn"

const SETTINGS_SELECT_CLASS =
  "h-9 rounded-xl border border-foreground/[0.10] bg-transparent px-3 text-sm text-strong outline-none transition-all focus:border-foreground/[0.28] focus:ring-2 focus:ring-foreground/[0.06]"

export function settingsSelectClassName(...classNames: Array<string | undefined | false>) {
  return cn(SETTINGS_SELECT_CLASS, classNames)
}
