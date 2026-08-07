import { Suspense } from "react"
import { ChannelType, db } from "@shopkeeper/db"
import { parseVoiceProposal } from "@shopkeeper/db"
import { normalizeStoredOrgSettings, resolveAgentSettings } from "@shopkeeper/agent/settings"
import { AgentConfigurePageSkeleton } from "@/app/dashboard/_components/skeletons"
import { getOrCreateOrg } from "@/lib/server/org"
import { fetchGatewayRuntimeFlags } from "@/lib/server/gateway-runtime-flags"
import ConfigurePageClient from "./_components/ConfigurePageClient"

export default async function AgentConfigurePage() {
  const org = await getOrCreateOrg()
  const rawSettings = normalizeStoredOrgSettings(org.settings)
  const settings = resolveAgentSettings(rawSettings)
  const integrations = await db.integration.findMany({
    where: { organizationId: org.id },
    select: { platform: true },
  })
  const emailConnected = integrations.some(integration => integration.platform === ChannelType.email)
  const shopifyConnected = integrations.some(integration => integration.platform === ChannelType.shopify)
  const runtimeFlags = await fetchGatewayRuntimeFlags()
    .then(flags => flags.monitors)
    .catch(() => null)

  return (
    <Suspense fallback={<AgentConfigurePageSkeleton />}>
      <ConfigurePageClient
        settings={settings}
        rawSettings={rawSettings}
        version={org.updatedAt.toISOString()}
        orgName={org.name}
        voiceProposal={parseVoiceProposal(org.voiceProposal)}
        emailConnected={emailConnected}
        shopifyConnected={shopifyConnected}
        runtimeFlags={runtimeFlags}
      />
    </Suspense>
  )
}
