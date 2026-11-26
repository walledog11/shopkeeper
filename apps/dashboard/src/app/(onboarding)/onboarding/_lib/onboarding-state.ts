import {
  DEFAULT_DATA,
  STEPS,
  type OnboardingData,
} from "./onboarding-model";

export interface StoredOnboardingState {
  data: OnboardingData;
  idx: number;
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
    const data = { ...DEFAULT_DATA };
    for (const key of Object.keys(DEFAULT_DATA) as (keyof OnboardingData)[]) {
      const value = stored[key];
      if (typeof value === "string") data[key] = value;
    }
    return { data, idx };
  } catch {
    return null;
  }
}
