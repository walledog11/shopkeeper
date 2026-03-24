export type Article = {
  id: string
  title: string
  body: Section[]
}

export type Section = {
  heading?: string
  text?: string
  steps?: string[]
  tips?: string[]
}

export type Category = {
  id: string
  title: string
  description: string
  icon: string
  articles: Article[]
}

export { gettingStarted } from "./getting-started"
export { tickets } from "./tickets"
export { aiFeatures } from "./ai-features"
export { integrations } from "./integrations"
export { settings } from "./settings"
export { troubleshooting } from "./troubleshooting"
export { reference } from "./reference"

import { gettingStarted } from "./getting-started"
import { tickets } from "./tickets"
import { aiFeatures } from "./ai-features"
import { integrations } from "./integrations"
import { settings } from "./settings"
import { troubleshooting } from "./troubleshooting"
import { reference } from "./reference"

export const ALL_CATEGORIES: Category[] = [
  gettingStarted,
  tickets,
  aiFeatures,
  integrations,
  settings,
  troubleshooting,
  reference,
]
