export type ProductHelpSection = {
  heading?: string
  text?: string
  steps?: string[]
  tips?: string[]
  callout?: string
  warning?: string
}

export type ProductHelpArticle = {
  id: string
  title: string
  summary?: string
  tag?: string
  readingTime?: number
  body: ProductHelpSection[]
}

export type ProductHelpCategory = {
  id: string
  title: string
  description: string
  icon: string
  articles: ProductHelpArticle[]
}
