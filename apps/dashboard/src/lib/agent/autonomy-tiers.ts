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
    id: "trusted",
    label: "Trusted",
    cap: 100,
    blurb: "Sends simple replies. Asks before refunds and cancellations.",
  },
];

export function visibleAutonomyTiers(): AutonomyTierOption[] {
  return AUTONOMY_TIERS;
}

export function effectiveRefundCap(settings: { autonomyTier?: AutonomyTier; maxRefundAmount?: number | null }): number {
  if (settings.maxRefundAmount != null) return settings.maxRefundAmount;
  return AUTONOMY_TIERS.find(option => option.id === settings.autonomyTier)?.cap ?? 50;
}
