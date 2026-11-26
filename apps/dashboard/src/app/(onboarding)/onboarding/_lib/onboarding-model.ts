import type { OnboardingStep } from "@shopkeeper/analytics";

export const RETURN_TO = "/onboarding";
export const STORAGE_KEY = "shopkeeper-onboarding-v4";
export type StepId = OnboardingStep;

export interface OnboardingData {
  shopDomain: string;
  forwardingEmail: string;
  storeName: string;
  gmailEmail: string;
  primaryEmail: string;
  /** The merchant's answers to the agent's new-hire questions. */
  sells: string;
  returns: string;
  never: string;
  /** The voice the merchant picked from the sample replies. */
  voice: string;
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
  gmailEmail: "",
  primaryEmail: "",
  sells: "",
  returns: "",
  never: "",
  voice: "",
};

export const STEPS: ReadonlyArray<{ id: StepId; label: string }> = [
  { id: "shopify", label: "Your store" },
  { id: "about", label: "About your shop" },
  { id: "voice", label: "Your voice" },
  { id: "email", label: "Customer messages" },
  { id: "connect", label: "Your phone" },
  { id: "live", label: "Go live" },
];

/** The signed-in person and workspace, read on the server so setup renders without waiting on the sign-in script. */
export interface OnboardingViewer {
  userId: string | null;
  firstName: string | null;
  organization: { id: string; name: string } | null;
}

const NEW_HIRE_ANSWERS = [
  ["sells", "What we sell"],
  ["returns", "Returns and refunds"],
  ["never", "Never promise or do"],
] as const satisfies readonly [keyof OnboardingData, string][];

/**
 * The store profile (`aiContext`) the agent reads with every reply, composed
 * from the merchant's answers. Empty when they answered nothing, so skipping
 * the questions keeps whatever profile the workspace already has.
 */
export function composeStoreProfile(data: OnboardingData): string {
  return NEW_HIRE_ANSWERS
    .map(([field, label]) => [label, data[field].trim()] as const)
    .filter(([, answer]) => answer)
    .map(([label, answer]) => `${label}: ${answer}`)
    .join("\n");
}
