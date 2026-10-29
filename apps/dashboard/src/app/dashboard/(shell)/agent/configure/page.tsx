import { Suspense } from "react"
import {
  ChannelType,
  DEFAULT_DAILY_LLM_SPEND_CAP_USD,
  db,
  getDailyLlmSpendNano,
  nanoDollarsToUsd,
  utcDayString,
} from "@shopkeeper/db"
import { parseVoiceProposal } from "@shopkeeper/db"
import { normalizeStoredOrgSettings, resolveAgentSettings } from "@shopkeeper/agent/settings"
import { AgentConfigurePageSkeleton } from "@/app/dashboard/_components/skeletons"
import { getOrCreateOrg } from "@/lib/server/org"
import { getMerchantPreferencesPageData } from "@/lib/server/merchant-preferences-data"
import logger from "@/lib/server/logger"
import ConfigurePageClient from "./_components/ConfigurePageClient"
import type { LlmSpendSnapshot } from "./_components/llm-spend-presentation"

function nextUtcDay(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}

export default async function AgentConfigurePage() {
  const org = await getOrCreateOrg()
  const rawSettings = normalizeStoredOrgSettings(org.settings)
  const settings = resolveAgentSettings(rawSettings)
  const [integrations, linkedPhones, merchantPreferences, spentNanoUsd] = await Promise.all([
    db.integration.findMany({
      where: { organizationId: org.id },
      select: { platform: true },
    }),
    db.orgMemberImessageBinding.count({ where: { orgMember: { organizationId: org.id } } }),
    getMerchantPreferencesPageData(org.id),
    getDailyLlmSpendNano(org.id).catch((error) => {
      logger.error({ err: error, organizationId: org.id }, "[agent-configure] LLM spend read failed")
      return null
    }),
  ])
  const shopifyConnected = integrations.some(integration => integration.platform === ChannelType.shopify)
  const llmSpend: LlmSpendSnapshot = {
    day: utcDayString(),
    defaultCapUsd: DEFAULT_DAILY_LLM_SPEND_CAP_USD,
    spentUsd: spentNanoUsd === null ? null : nanoDollarsToUsd(spentNanoUsd),
    resetAt: nextUtcDay(),
  }

  return (
    <Suspense fallback={<AgentConfigurePageSkeleton />}>
      <ConfigurePageClient
        settings={settings}
        rawSettings={rawSettings}
        version={org.updatedAt.toISOString()}
        orgName={org.name}
        voiceProposal={parseVoiceProposal(org.voiceProposal)}
        shopifyConnected={shopifyConnected}
        phoneLinked={linkedPhones > 0}
        merchantPreferences={merchantPreferences}
        llmSpend={llmSpend}
      />
    </Suspense>
  )
}
