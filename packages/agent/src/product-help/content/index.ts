import type { ProductHelpArticle, ProductHelpCategory, ProductHelpSection } from "../types.js"

export type Article = ProductHelpArticle
export type Section = ProductHelpSection
export type Category = ProductHelpCategory

export function withAgentName(text: string, agentName: string): string {
  return text.replaceAll("{agent}", agentName)
}

import { gettingStarted } from "./getting-started.js"
import { tickets } from "./tickets.js"
import { aiFeatures } from "./ai-features.js"
import { integrations } from "./integrations.js"
import { settings } from "./settings.js"
import { troubleshooting } from "./troubleshooting.js"
import { reference } from "./reference.js"
import { tips } from "./tips.js"

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
