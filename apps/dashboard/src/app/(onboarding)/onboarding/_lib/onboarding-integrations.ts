import { getEmailProvider } from "@shopkeeper/email/providers";
import { isEmailIntegrationConfigured } from "@/lib/integrations/onboarding-setup";
import type { Integration } from "@/types";

export function isInstagramIntegrationConfigured(integration: Integration | undefined): boolean {
  if (!integration || integration.platform !== "ig_dm") return false;
  return Boolean((integration.externalAccountId ?? "").trim());
}

export interface OnboardingIntegrations {
  emailReady: boolean;
  forwarding: Integration | undefined;
  gmail: Integration | undefined;
  instagram: Integration | undefined;
  instagramReady: boolean;
  preferredEmail: Integration | undefined;
  shopify: Integration | undefined;
}

export function selectOnboardingIntegrations(
  rows: readonly Integration[],
): OnboardingIntegrations {
  const emailRows = rows.filter((row) => row.platform === "email");
  const gmail = emailRows.find((row) => getEmailProvider(row) === "gmail");
  const forwarding = emailRows.find((row) => getEmailProvider(row) === "postmark");

  const instagram = rows.find((row) => row.platform === "ig_dm");

  return {
    emailReady: emailRows.some(isEmailIntegrationConfigured),
    forwarding,
    gmail,
    instagram,
    instagramReady: isInstagramIntegrationConfigured(instagram),
    preferredEmail: emailRows.find((row) => row.isDefaultEmail) ?? gmail ?? forwarding,
    shopify: rows.find((row) => row.platform === "shopify"),
  };
}
