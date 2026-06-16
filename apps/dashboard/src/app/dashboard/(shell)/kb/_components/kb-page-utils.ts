import type { KbArticle, KbSource } from "@/types"

export type SortKey = 'recent' | 'alpha'
export type ArticleWithBase = KbArticle & { baseName: string; baseSource: KbSource }
export type MobileView = 'list' | 'detail'

export const inputCls = "w-full text-sm text-foreground/80 bg-foreground/[0.06] border border-foreground/[0.12] rounded-md px-3 py-2 focus:outline-none focus:border-foreground/[0.25] placeholder:text-foreground/25"

export const parseTags = (raw: string) => raw.split(',').flatMap(t => {
  const tag = t.trim()
  return tag ? [tag] : []
})

export const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently updated' },
  { value: 'alpha', label: 'Alphabetical (A-Z)' },
]
