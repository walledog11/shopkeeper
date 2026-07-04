import { Suspense } from "react"
import IntegrationsPageClient from "./_components/IntegrationsPageClient"
import { normalizeTelegramBotUsername } from "@/lib/integrations/telegram-visibility"
import { isGmailNativeInboundEnabled } from "@/lib/env"

export default function IntegrationsPage() {
  const telegramBotUsername = normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME)
  const imessageHandle = process.env.IMESSAGE_LINE_HANDLE?.trim() || null
  const gmailNativeInboundEnabled = isGmailNativeInboundEnabled()

  return (
    <Suspense fallback={null}>
      <IntegrationsPageClient
        telegramBotUsername={telegramBotUsername}
        imessageHandle={imessageHandle}
        gmailNativeInboundEnabled={gmailNativeInboundEnabled}
      />
    </Suspense>
  )
}
