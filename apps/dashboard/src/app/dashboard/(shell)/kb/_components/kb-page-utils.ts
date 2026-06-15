import type { KbArticle, KbSource } from "@/types"

export type SortKey = 'recent' | 'alpha'
export type ArticleWithBase = KbArticle & { baseName: string; baseSource: KbSource }
export type MobileView = 'list' | 'detail'

export const inputCls = "w-full text-sm text-white/80 bg-white/[0.06] border border-white/[0.12] rounded-md px-3 py-2 focus:outline-none focus:border-white/[0.25] placeholder:text-white/25"

export const parseTags = (raw: string) => raw.split(',').flatMap(t => {
  const tag = t.trim()
  return tag ? [tag] : []
})

export const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently updated' },
  { value: 'alpha', label: 'Alphabetical (A-Z)' },
]
