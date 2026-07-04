export const RETURN_TO = "/onboarding";
export const STORAGE_KEY = "concierge-onboarding-v2";
export type StepId = "intro" | "shopify" | "email" | "connect" | "plan";
export type OnboardingPlatform = "email" | "shopify";

export interface OnboardingData {
  storeName: string;
  founderName: string;
  primaryEmail: string;
}

export type IntegrationRow = {
  id: string;
  platform: string;
  externalAccountId: string;
  fromEmail: string | null;
  metadata?: unknown;
  lastActivity?: string | null;
};

export type KbSyncState = {
  status: "idle" | "syncing" | "done" | "error";
  policies: number;
  pages: number;
};

export const DEFAULT_DATA: OnboardingData = {
  storeName: "",
  founderName: "",
  primaryEmail: "",
};

export const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "intro",   label: "Your operator" },
  { id: "shopify", label: "Shopify" },
  { id: "email",   label: "Channels" },
  { id: "connect", label: "Your phone" },
  { id: "plan",    label: "Review" },
];
