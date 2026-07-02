import { normalizeTelegramBotUsername } from "@/lib/integrations/telegram-visibility";
import { isShopifySimulatorEnabled } from "@/lib/integrations/shopify-simulator";
import { OnboardingExperience } from "./_components/OnboardingExperience";

export default function OnboardingPage() {
  const telegramBotUsername = normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME);
  const imessageHandle = process.env.IMESSAGE_LINE_HANDLE?.trim() || null;
  const shopifySimulatorEnabled = isShopifySimulatorEnabled();

  return (
    <OnboardingExperience
      telegramBotUsername={telegramBotUsername}
      imessageHandle={imessageHandle}
      shopifySimulatorEnabled={shopifySimulatorEnabled}
    />
  );
}
