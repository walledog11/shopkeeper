export const RETURN_TO = "/onboarding";
export const STORAGE_KEY = "concierge-onboarding-v2";
export type StepId = "intro" | "shopify" | "email" | "connect" | "plan";

export interface ImessageStatus {
  connected: boolean;
  handles: { senderId: string; displayLabel: string }[];
}

export interface OnboardingData {
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
  forwardingEmail: "",
  storeName: "",
  founderName: "",
  gmailEmail: "",
  primaryEmail: "",
};

export const STEPS: ReadonlyArray<{ id: StepId }> = [
  { id: "intro" },
  { id: "shopify" },
  { id: "email" },
  { id: "connect" },
  { id: "plan" },
];
