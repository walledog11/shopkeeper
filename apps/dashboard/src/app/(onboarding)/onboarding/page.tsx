import { normalizeTelegramBotUsername } from "@/lib/integrations/telegram-visibility";
import { normalizeImessageLineHandle } from "@/lib/integrations/imessage-visibility";
import { isShopifySimulatorEnabled } from "@/lib/integrations/shopify-simulator";
import { OnboardingExperience } from "./_components/OnboardingExperience";

export default function OnboardingPage() {
  const telegramBotUsername = normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME);
  const imessageHandle = normalizeImessageLineHandle(process.env.IMESSAGE_LINE_HANDLE);
  const shopifySimulatorEnabled = isShopifySimulatorEnabled();

  return (
    <OnboardingExperience
      telegramBotUsername={telegramBotUsername}
      imessageHandle={imessageHandle}
      shopifySimulatorEnabled={shopifySimulatorEnabled}
    />
  );
}
