import {
  ChannelType,
  DEFAULT_DAILY_LLM_SPEND_CAP_USD,
  db,
  getDailyLlmSpendNano,
  nanoDollarsToUsd,
  utcDayString,
} from "@shopkeeper/db"
import { normalizeStoredOrgSettings, resolveAgentSettings } from "@shopkeeper/agent/settings"
import { getOrCreateOrg } from "@/lib/server/org"
import logger from "@/lib/server/logger"
import type { AgentSettingsFormProps, AgentSettingsPage } from "./AgentSettingsForm"

function nextUtcDay(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}

/** Reads what one settings page shows; pages that don't show a value skip its query. */
export async function loadAgentSettingsForm(page: AgentSettingsPage): Promise<AgentSettingsFormProps> {
  const org = await getOrCreateOrg()
  const rawSettings = normalizeStoredOrgSettings(org.settings)
  const [shopifyIntegrations, linkedPhones, spentNanoUsd] = await Promise.all([
    page === "briefing"
      ? db.integration.count({ where: { organizationId: org.id, platform: ChannelType.shopify } })
      : 0,
    page === "briefing"
      ? db.orgMemberImessageBinding.count({ where: { orgMember: { organizationId: org.id } } })
      : 0,
    page === "usage"
      ? getDailyLlmSpendNano(org.id).catch((error) => {
          logger.error({ err: error, organizationId: org.id }, "[settings] LLM spend read failed")
          return null
        })
      : null,
  ])

  return {
    page,
    settings: resolveAgentSettings(rawSettings),
    rawSettings,
    version: org.updatedAt.toISOString(),
    orgName: org.name,
    shopifyConnected: shopifyIntegrations > 0,
    phoneLinked: linkedPhones > 0,
    llmSpend: {
      day: utcDayString(),
      defaultCapUsd: DEFAULT_DAILY_LLM_SPEND_CAP_USD,
      spentUsd: spentNanoUsd === null ? null : nanoDollarsToUsd(spentNanoUsd),
      resetAt: nextUtcDay(),
    },
  }
}
