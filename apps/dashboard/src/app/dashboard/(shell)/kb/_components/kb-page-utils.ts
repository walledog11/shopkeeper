import { cn } from "@/lib/ui/cn"
import { GLASS_CARD_SURFACE } from "@/lib/ui/glass-card-styles"
import type { KbArticle, KbSource } from "@/types"

export type SortKey = 'recent' | 'alpha'
export type ArticleWithBase = KbArticle & { baseName: string; baseSource: KbSource }

export const inputCls = "w-full text-sm text-foreground/80 bg-foreground/[0.06] border border-foreground/[0.12] rounded-md px-3 py-2 focus:outline-none focus:border-foreground/[0.25] placeholder:text-foreground/25"

export const MEMORY_CARD_SHELL = cn(
  "flex w-full flex-col rounded-3xl px-5 py-5 font-sans",
  GLASS_CARD_SURFACE,
)
