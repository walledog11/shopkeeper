import type { Metadata } from "next";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@shopkeeper/db";
import { getE2EAuthIdentity } from "@/lib/e2e-auth";
import { normalizeImessageLineHandle } from "@/lib/integrations/imessage-visibility";
import { isShopifySimulatorEnabled } from "@/lib/integrations/shopify-simulator";
import { getShopifyOAuthAuthorizeConfig } from "@/lib/env";
import { normalizeShopifyShopDomain } from "@/lib/shopify/oauth";
import { readShopifyInstallClaim } from "@/lib/shopify/install-claim";
import { resolveInstagramConnectTransport } from "@/lib/socialapi/config";
import { isStorefrontChatGloballyEnabled } from "@/lib/storefront-chat/enabled";
import { OnboardingExperience } from "./_components/OnboardingExperience";
import { STEPS, type OnboardingViewer } from "./_lib/onboarding-model";
import { parseOAuthOutcome } from "@/lib/integrations/oauth-contract";

function parseResumeStep(value: string | string[] | undefined): number | null {
  const idx = STEPS.findIndex(step => step.id === value);
  return idx >= 0 ? idx : null;
}

// The person and workspace come from the server, so the first render is the
// step itself rather than a wait for the sign-in script.
async function loadViewer(userId: string | null, orgId: string | null, testLogin: boolean): Promise<OnboardingViewer> {
  const [user, organization] = await Promise.all([
    userId && !testLogin ? currentUser().catch(() => null) : null,
    orgId ? db.organization.findUnique({ where: { clerkOrgId: orgId }, select: { name: true } }) : null,
  ]);
  return {
    userId,
    firstName: user?.firstName?.trim() || null,
    organization: orgId ? { id: orgId, name: organization?.name ?? "" } : null,
  };
}

// The wizard creates a workspace for someone who has none. A member with no
// workspace selected picks theirs instead: creating one here is how one merchant
// ended up with four workspaces named after the same store.
async function belongsToAWorkspace(userId: string): Promise<boolean> {
  const client = await clerkClient();
  const { totalCount } = await client.users.getOrganizationMembershipList({ userId, limit: 1 });
  return totalCount > 0;
}

export const metadata: Metadata = { title: "Set up Shopkeeper" };

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
    shop?: string | string[];
    claim?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const pinnedStepIndex = parseResumeStep(params.step);

  const testLogin = getE2EAuthIdentity();
  const { orgId, userId } = testLogin ?? await auth();
  if (!orgId && userId && !testLogin && await belongsToAWorkspace(userId)) {
    redirect("/select-org");
  }
  const viewer = await loadViewer(userId, orgId ?? null, Boolean(testLogin));
  const imessageHandle = normalizeImessageLineHandle(process.env.IMESSAGE_LINE_HANDLE);
  const shopifySimulatorEnabled = isShopifySimulatorEnabled();
  const instagramConnectTransport = resolveInstagramConnectTransport(orgId);
  const storefrontChatGloballyEnabled = isStorefrontChatGloballyEnabled();
  const shopifyClientId = getShopifyOAuthAuthorizeConfig()?.clientId ?? null;
  const oauthParams = new URLSearchParams();
  for (const key of ["provider", "status", "error"] as const) {
    const value = params[key];
    if (typeof value === "string") oauthParams.set(key, value);
  }
  const oauthOutcome = parseOAuthOutcome(oauthParams);
  // The app home inside Shopify admin sends a new merchant here with their store
  // and, when it holds the install's grant, a claim that connects it in one step.
  const claim = typeof params.claim === "string" ? params.claim : null;
  const claimedInstall = readShopifyInstallClaim(claim);
  const shopifyClaim = claim && claimedInstall ? { claim, shop: claimedInstall.shop } : null;
  const suggestedShop = shopifyClaim?.shop
    ?? (typeof params.shop === "string" ? normalizeShopifyShopDomain(params.shop) : null);

  return (
    <OnboardingExperience
      viewer={viewer}
      imessageHandle={imessageHandle}
      shopifySimulatorEnabled={shopifySimulatorEnabled}
      instagramConnectTransport={instagramConnectTransport}
      storefrontChatGloballyEnabled={storefrontChatGloballyEnabled}
      shopifyClientId={shopifyClientId}
      pinnedStepIndex={pinnedStepIndex}
      oauthOutcome={oauthOutcome}
      suggestedShop={suggestedShop}
      shopifyClaim={shopifyClaim}
    />
  );
}
