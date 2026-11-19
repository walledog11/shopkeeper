import type { AutonomyTier } from "@shopkeeper/agent/settings";

export interface AutonomyTierOption {
  id: AutonomyTier;
  label: string;
  cap: number;
  blurb: string;
  recommended?: boolean;
}

export const AUTONOMY_TIERS: AutonomyTierOption[] = [
  {
    id: "watch",
    label: "Draft only",
    cap: 0,
    blurb: "Drafts everything. Nothing is sent or changed.",
  },
  {
    id: "guarded",
    label: "Ask first",
    cap: 50,
    blurb: "Answers routine questions. Asks before anything else.",
    recommended: true,
  },
  {
    // Differs from Ask first only in its compensation limit until merchants can
    // turn on auto-execution, so the blurb promises no more than that.
    id: "trusted",
    label: "Trusted",
    cap: 100,
    blurb: "Like Ask first, with a higher limit on refunds and gift cards.",
  },
];

export function visibleAutonomyTiers(): AutonomyTierOption[] {
  return AUTONOMY_TIERS;
}
