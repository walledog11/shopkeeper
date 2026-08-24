import { normalizeImessageLineHandle } from "@/lib/integrations/imessage-visibility";
import { isShopifySimulatorEnabled } from "@/lib/integrations/shopify-simulator";
import {
  resolveOnboardingStepIndex,
  type OnboardingResumeStep,
} from "@/lib/integrations/onboarding-setup";
import { OnboardingExperience } from "./_components/OnboardingExperience";
import { STEPS } from "./_components/model";
import { parseOAuthOutcome } from "@/lib/integrations/oauth-contract";

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
  searchParams: Promise<{
    step?: string | string[];
    provider?: string | string[];
    status?: string | string[];
    error?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const { step } = params;
  const resumeStep = parseResumeStep(step);
  const pinnedStepIndex = resumeStep
    ? resolveOnboardingStepIndex(resumeStep, 0, STEPS.map(s => s.id))
    : null;

  const imessageHandle = normalizeImessageLineHandle(process.env.IMESSAGE_LINE_HANDLE);
  const shopifySimulatorEnabled = isShopifySimulatorEnabled();
  const oauthParams = new URLSearchParams();
  for (const key of ["provider", "status", "error"] as const) {
    const value = params[key];
    if (typeof value === "string") oauthParams.set(key, value);
  }
  const oauthOutcome = parseOAuthOutcome(oauthParams);

  return (
    <OnboardingExperience
      imessageHandle={imessageHandle}
      shopifySimulatorEnabled={shopifySimulatorEnabled}
      pinnedStepIndex={pinnedStepIndex}
      oauthOutcome={oauthOutcome}
    />
  );
}
