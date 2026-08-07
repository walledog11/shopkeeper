import { normalizeTelegramBotUsername } from "@/lib/integrations/telegram-visibility";
import { normalizeImessageLineHandle } from "@/lib/integrations/imessage-visibility";
import { isShopifySimulatorEnabled } from "@/lib/integrations/shopify-simulator";
import {
  resolveOnboardingStepIndex,
  type OnboardingResumeStep,
} from "@/lib/integrations/onboarding-setup";
import { OnboardingExperience } from "./_components/OnboardingExperience";
import { STEPS } from "./_components/model";

function parseResumeStep(value: string | string[] | undefined): OnboardingResumeStep | null {
  if (value === "shopify" || value === "email" || value === "plan") return value;
  return null;
}

// Every OAuth hop returns to `/onboarding?step=…`. Resolving it here rather than
// from `window.location` in the wizard's reducer is what keeps the first render
// identical on the server and the client.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const { step } = await searchParams;
  const resumeStep = parseResumeStep(step);
  const pinnedStepIndex = resumeStep
    ? resolveOnboardingStepIndex(resumeStep, 0, STEPS.map(s => s.id))
    : null;

  const telegramBotUsername = normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME);
  const imessageHandle = normalizeImessageLineHandle(process.env.IMESSAGE_LINE_HANDLE);
  const shopifySimulatorEnabled = isShopifySimulatorEnabled();

  return (
    <OnboardingExperience
      telegramBotUsername={telegramBotUsername}
      imessageHandle={imessageHandle}
      shopifySimulatorEnabled={shopifySimulatorEnabled}
      pinnedStepIndex={pinnedStepIndex}
    />
  );
}
