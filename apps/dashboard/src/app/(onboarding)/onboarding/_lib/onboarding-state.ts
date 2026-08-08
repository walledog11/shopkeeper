import {
  DEFAULT_DATA,
  STEPS,
  type OnboardingData,
} from "../_components/model";

export interface StoredOnboardingState {
  data: OnboardingData;
  idx: number;
}

function storedString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseStoredOnboardingState(raw: string | null): StoredOnboardingState | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const stored = parsed as Record<string, unknown>;
    const idx = typeof stored.idx === "number"
      && Number.isInteger(stored.idx)
      && stored.idx >= 0
      && stored.idx < STEPS.length
      ? stored.idx
      : 0;

    return {
      data: {
        ...DEFAULT_DATA,
        forwardingEmail: storedString(stored.forwardingEmail),
        storeName: storedString(stored.storeName),
        founderName: storedString(stored.founderName),
        gmailEmail: storedString(stored.gmailEmail),
        primaryEmail: storedString(stored.primaryEmail),
      },
      idx,
    };
  } catch {
    return null;
  }
}
