import { Suspense } from "react"
import IntegrationsPageClient from "./_components/IntegrationsPageClient"
import { normalizeTelegramBotUsername } from "@/lib/integrations/telegram-visibility"

export default function IntegrationsPage() {
  const telegramBotUsername = normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME)

  return (
    <Suspense fallback={null}>
      <IntegrationsPageClient telegramBotUsername={telegramBotUsername} />
    </Suspense>
  )
}
