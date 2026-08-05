export type Article = {
  id: string
  title: string
  summary?: string
  tag?: string
  readingTime?: number // minutes
  body: Section[]
}

export type Section = {
  heading?: string
  text?: string
  steps?: string[]
  tips?: string[]
  callout?: string   // highlighted tip box (blue)
  warning?: string   // warning box (amber)
}

export type Category = {
  id: string
  title: string
  description: string
  icon: string
  articles: Article[]
}

// Help copy is static data, but the agent is named per org. Content writes
// `{agent}` and every render point substitutes the merchant's own name, so the
// help panel speaks the same way the rest of the dashboard does.
export function withAgentName(text: string, agentName: string): string {
  return text.replaceAll("{agent}", agentName)
}

import { gettingStarted } from "./getting-started"
import { tickets } from "./tickets"
import { aiFeatures } from "./ai-features"
import { integrations } from "./integrations"
import { settings } from "./settings"
import { troubleshooting } from "./troubleshooting"
import { reference } from "./reference"
import { tips } from "./tips"

export {
  gettingStarted,
  tickets,
  aiFeatures,
  integrations,
  settings,
  troubleshooting,
  reference,
  tips,
}

export const ALL_CATEGORIES: Category[] = [
  gettingStarted,
  tickets,
  aiFeatures,
  integrations,
  settings,
  troubleshooting,
  reference,
  tips,
]
