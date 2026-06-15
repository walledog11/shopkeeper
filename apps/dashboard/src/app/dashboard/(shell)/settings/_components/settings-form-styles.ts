import { cn } from "@/lib/ui/cn"

const SETTINGS_SELECT_CLASS =
  "h-9 rounded-md border border-white/[0.12] bg-white/[0.06] px-3 text-sm text-white/70 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"

export function settingsSelectClassName(...classNames: Array<string | undefined | false>) {
  return cn(SETTINGS_SELECT_CLASS, classNames)
}
