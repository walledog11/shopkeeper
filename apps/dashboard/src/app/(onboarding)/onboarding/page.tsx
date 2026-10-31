import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getE2EAuthIdentity } from "@/lib/e2e-auth";
import { normalizeImessageLineHandle } from "@/lib/integrations/imessage-visibility";
import { isShopifySimulatorEnabled } from "@/lib/integrations/shopify-simulator";
import { getShopifyOAuthAuthorizeConfig } from "@/lib/env";
import { resolveInstagramConnectTransport } from "@/lib/socialapi/config";
import { isStorefrontChatGloballyEnabled } from "@/lib/storefront-chat/enabled";
import {
  resolveOnboardingStepIndex,
  type OnboardingResumeStep,
} from "@/lib/integrations/onboarding-setup";
import { OnboardingExperience } from "./_components/OnboardingExperience";
import { STEPS } from "./_lib/onboarding-model";
import { parseOAuthOutcome } from "@/lib/integrations/oauth-contract";

function parseResumeStep(value: string | string[] | undefined): OnboardingResumeStep | null {
  if (value === "shopify" || value === "email" || value === "connect" || value === "plan") return value;
  return null;
}

// The wizard creates a workspace for someone who has none. A member with no
// workspace selected picks theirs instead: creating one here is how one merchant
// ended up with four workspaces named after the same store.
async function belongsToAWorkspace(userId: string): Promise<boolean> {
  const client = await clerkClient();
  const { totalCount } = await client.users.getOrganizationMembershipList({ userId, limit: 1 });
  return totalCount > 0;
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

  const { orgId, userId } = await auth();
  if (!orgId && userId && !getE2EAuthIdentity() && await belongsToAWorkspace(userId)) {
    redirect("/select-org");
  }
  const imessageHandle = normalizeImessageLineHandle(process.env.IMESSAGE_LINE_HANDLE);
  const shopifySimulatorEnabled = isShopifySimulatorEnabled();
  const instagramConnectAvailable = resolveInstagramConnectTransport(orgId) !== null;
  const storefrontChatGloballyEnabled = isStorefrontChatGloballyEnabled();
  const shopifyClientId = getShopifyOAuthAuthorizeConfig()?.clientId ?? null;
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
      instagramConnectAvailable={instagramConnectAvailable}
      storefrontChatGloballyEnabled={storefrontChatGloballyEnabled}
      shopifyClientId={shopifyClientId}
      pinnedStepIndex={pinnedStepIndex}
      oauthOutcome={oauthOutcome}
    />
  );
}
