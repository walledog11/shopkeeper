import type { AutonomyTier } from "@shopkeeper/agent/settings";
import { AUTONOMY_TIERS } from "@/lib/agent/autonomy-tiers";

export type { AutonomyTier };
export { AUTONOMY_TIERS };

export const RETURN_TO = "/onboarding";
export const STORAGE_KEY = "concierge-onboarding-v1";
export type StepId = "intro" | "store" | "shopify" | "email" | "autonomy" | "plan";
export type OnboardingPlatform = "email" | "shopify";

export interface OnboardingData {
  storeName: string;
  sells: string;
  founderName: string;
  primaryEmail: string;
  autonomy: AutonomyTier;
}

export type IntegrationRow = {
  platform: string;
  externalAccountId: string;
  fromEmail: string | null;
  lastActivity?: string | null;
};

export const DEFAULT_DATA: OnboardingData = {
  storeName: "",
  sells: "",
  founderName: "",
  primaryEmail: "",
  autonomy: "guarded",
};

export const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "intro",    label: "Meet me" },
  { id: "store",    label: "Your store" },
  { id: "shopify",  label: "Connect Shopify" },
  { id: "email",    label: "Set up email" },
  { id: "autonomy", label: "My limits" },
  { id: "plan",     label: "First night" },
];

export const ONBOARDING_ESSENTIALS_TOTAL = 3;
