import { getEmailProvider } from "@shopkeeper/email/providers";
import { isEmailIntegrationConfigured } from "@/lib/integrations/onboarding-setup";
import type { Integration } from "@/types";

export interface OnboardingIntegrations {
  emailReady: boolean;
  forwarding: Integration | undefined;
  gmail: Integration | undefined;
  preferredEmail: Integration | undefined;
  shopify: Integration | undefined;
}

export function selectOnboardingIntegrations(
  rows: readonly Integration[],
): OnboardingIntegrations {
  const emailRows = rows.filter((row) => row.platform === "email");
  const gmail = emailRows.find((row) => getEmailProvider(row) === "gmail");
  const forwarding = emailRows.find((row) => getEmailProvider(row) === "postmark");

  return {
    emailReady: emailRows.some(isEmailIntegrationConfigured),
    forwarding,
    gmail,
    preferredEmail: emailRows.find((row) => row.isDefaultEmail) ?? gmail ?? forwarding,
    shopify: rows.find((row) => row.platform === "shopify"),
  };
}
