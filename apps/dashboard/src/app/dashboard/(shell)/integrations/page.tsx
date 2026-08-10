import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { IntegrationsPageSkeleton } from "@/app/dashboard/_components/skeletons"
import IntegrationsPageClient from "./_components/IntegrationsPageClient"
import { normalizeTelegramBotUsername } from "@/lib/integrations/telegram-visibility"
import { normalizeImessageLineHandle } from "@/lib/integrations/imessage-visibility"
import {
  getShopifyOAuthAuthorizeConfig,
  isGmailNativeInboundEnabled,
  isInstagramIntegrationEnabledForOrg,
} from "@/lib/env"
import { isStorefrontChatGloballyEnabled } from "@/lib/storefront-chat/enabled"
import { isTikTokShopOAuthConfigured } from "@/lib/tiktok-shop/config"
import { getOrCreateOrg } from "@/lib/server/org"
import { getIntegrationsForOrg } from "@/lib/server/integrations-list"
import { getTelegramMemberStatus } from "@/lib/server/telegram-integration"

export default async function IntegrationsPage() {
  const { orgId, userId } = await auth()
  const org = await getOrCreateOrg()
  const [initialIntegrations, initialTelegramStatus] = await Promise.all([
    getIntegrationsForOrg(org),
    userId ? getTelegramMemberStatus(org.id, userId) : Promise.resolve(null),
  ])
  const telegramBotUsername = normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME)
  const imessageHandle = normalizeImessageLineHandle(process.env.IMESSAGE_LINE_HANDLE)
  const gmailNativeInboundEnabled = isGmailNativeInboundEnabled()
  const instagramIntegrationEnabled = isInstagramIntegrationEnabledForOrg(orgId)
  const tiktokShopConfigured = isTikTokShopOAuthConfigured()
  const storefrontChatGloballyEnabled = isStorefrontChatGloballyEnabled()
  const shopifyClientId = getShopifyOAuthAuthorizeConfig()?.clientId ?? null

  return (
    <Suspense fallback={<IntegrationsPageSkeleton />}>
      <IntegrationsPageClient
        telegramBotUsername={telegramBotUsername}
        initialTelegramStatus={initialTelegramStatus}
        imessageHandle={imessageHandle}
        gmailNativeInboundEnabled={gmailNativeInboundEnabled}
        instagramIntegrationEnabled={instagramIntegrationEnabled}
        tiktokShopConfigured={tiktokShopConfigured}
        initialIntegrations={initialIntegrations}
        shopifyClientId={shopifyClientId}
        storefrontChatGloballyEnabled={storefrontChatGloballyEnabled}
      />
    </Suspense>
  )
}
