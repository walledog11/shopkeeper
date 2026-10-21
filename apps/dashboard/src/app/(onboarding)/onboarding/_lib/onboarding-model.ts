export const RETURN_TO = "/onboarding";
export const STORAGE_KEY = "shopkeeper-onboarding-v3";
export type StepId = "shopify" | "email" | "connect" | "plan";

export interface OnboardingData {
  shopDomain: string;
  forwardingEmail: string;
  storeName: string;
  founderName: string;
  gmailEmail: string;
  primaryEmail: string;
}

export type KbSyncState =
  | { status: "idle" }
  | { status: "pending"; integrationId: string }
  | {
      status: "failed";
      integrationId: string;
      error: unknown;
      message: string;
      canRetry: boolean;
    }
  | {
      status: "succeeded";
      integrationId: string;
      policies: number;
      pages: number;
    };

export type KbSyncViewModel = KbSyncState & { retry: () => void };

export const DEFAULT_DATA: OnboardingData = {
  shopDomain: "",
  forwardingEmail: "",
  storeName: "",
  founderName: "",
  gmailEmail: "",
  primaryEmail: "",
};

export const STEPS: ReadonlyArray<{ id: StepId; label: string }> = [
  { id: "shopify", label: "Your store" },
  { id: "email", label: "Customer messages" },
  { id: "connect", label: "Your approvals" },
  { id: "plan", label: "Your first draft" },
];
