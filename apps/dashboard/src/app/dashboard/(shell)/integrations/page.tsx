import { Suspense } from "react"
import IntegrationsPageClient from "./_components/IntegrationsPageClient"
import { normalizeTelegramBotUsername } from "@/lib/integrations/telegram-visibility"
import { normalizeImessageLineHandle } from "@/lib/integrations/imessage-visibility"
import { isGmailNativeInboundEnabled } from "@/lib/env"
import { isTikTokShopOAuthConfigured } from "@/lib/tiktok-shop/config"

export default function IntegrationsPage() {
  const telegramBotUsername = normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME)
  const imessageHandle = normalizeImessageLineHandle(process.env.IMESSAGE_LINE_HANDLE)
  const gmailNativeInboundEnabled = isGmailNativeInboundEnabled()
  const tiktokShopConfigured = isTikTokShopOAuthConfigured()

  return (
    <Suspense fallback={null}>
      <IntegrationsPageClient
        telegramBotUsername={telegramBotUsername}
        imessageHandle={imessageHandle}
        gmailNativeInboundEnabled={gmailNativeInboundEnabled}
        tiktokShopConfigured={tiktokShopConfigured}
      />
    </Suspense>
  )
}
