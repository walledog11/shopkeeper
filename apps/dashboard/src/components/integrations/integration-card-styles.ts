import { cn } from "@/lib/ui/cn"

const CARD_BUTTON_FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"

export const CARD_SHELL = cn(
  "group flex h-52 flex-col rounded-2xl bg-card border border-border px-5 pt-5 pb-5 scroll-mt-6",
  "transition-all duration-200",
  "hover:border-border/80 hover:shadow-sm",
)

export const LOGO_INLINE = "size-8 shrink-0"
export const LOGO_SOFTEN = "opacity-[0.88] saturate-[0.9] transition-all duration-200 group-hover:opacity-100 group-hover:saturate-100"
export const LOGO_IMAGE = cn(LOGO_INLINE, "object-contain", LOGO_SOFTEN)
export const CARD_TITLE = "text-xl font-bold text-card-foreground leading-[22px]"
export const CARD_DESCRIPTION = "mt-2 min-h-[3.375rem] line-clamp-3 text-[13.5px] leading-[18px] text-muted-foreground"
export const CARD_ACTIONS = "mt-auto flex w-full shrink-0 gap-2 pt-4"
export const CARD_BUTTON = cn("h-10 flex-1 rounded-[10px] text-[17px] font-medium transition-colors", CARD_BUTTON_FOCUS)
export const CARD_BUTTON_PRIMARY = cn(CARD_BUTTON, "bg-primary text-primary-foreground hover:bg-primary/90")
export const CARD_BUTTON_SECONDARY = cn(CARD_BUTTON, "bg-secondary hover:bg-accent border border-border text-secondary-foreground")
export const CARD_BUTTON_AMBER = cn(CARD_BUTTON, "bg-amber-400/10 hover:bg-amber-400/15 border border-amber-400/25 text-amber-300")
export const CARD_BUTTON_DISABLED = cn(CARD_BUTTON, "bg-muted text-muted-foreground cursor-default")
export const INTEGRATION_CONFIGURE_DIALOG_CLASS = cn(
  "bg-popover border-border rounded-2xl p-6 gap-5 sm:max-w-[420px]",
  "max-h-[85vh] overflow-x-hidden overflow-y-auto",
  "[&>button]:text-muted-foreground [&>button]:hover:text-foreground",
)
