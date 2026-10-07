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
    blurb: "Drafts only — nothing is sent or changed in Shopify.",
  },
  {
    id: "guarded",
    label: "Ask first",
    cap: 50,
    blurb: "Routine replies; asks before money, exceptions, or store changes.",
    recommended: true,
  },
  {
    id: "trusted",
    label: "Trusted",
    cap: 100,
    blurb: "Sends simple replies on its own; refunds and cancellations still need approval.",
  },
];

export function visibleAutonomyTiers(): AutonomyTierOption[] {
  return AUTONOMY_TIERS;
}

export function effectiveRefundCap(settings: { autonomyTier?: AutonomyTier; maxRefundAmount?: number | null }): number {
  if (settings.maxRefundAmount != null) return settings.maxRefundAmount;
  return AUTONOMY_TIERS.find(option => option.id === settings.autonomyTier)?.cap ?? 50;
}
