import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import IntegrationsPageClient from "./_components/IntegrationsPageClient"
import { normalizeTelegramBotUsername } from "@/lib/integrations/telegram-visibility"
import { normalizeImessageLineHandle } from "@/lib/integrations/imessage-visibility"
import { isGmailNativeInboundEnabled, isInstagramIntegrationEnabledForOrg } from "@/lib/env"
import { isTikTokShopOAuthConfigured } from "@/lib/tiktok-shop/config"

export default async function IntegrationsPage() {
  const { orgId } = await auth()
  const telegramBotUsername = normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME)
  const imessageHandle = normalizeImessageLineHandle(process.env.IMESSAGE_LINE_HANDLE)
  const gmailNativeInboundEnabled = isGmailNativeInboundEnabled()
  const instagramIntegrationEnabled = isInstagramIntegrationEnabledForOrg(orgId)
  const tiktokShopConfigured = isTikTokShopOAuthConfigured()

  return (
    <Suspense fallback={null}>
      <IntegrationsPageClient
        telegramBotUsername={telegramBotUsername}
        imessageHandle={imessageHandle}
        gmailNativeInboundEnabled={gmailNativeInboundEnabled}
        instagramIntegrationEnabled={instagramIntegrationEnabled}
        tiktokShopConfigured={tiktokShopConfigured}
      />
    </Suspense>
  )
}
