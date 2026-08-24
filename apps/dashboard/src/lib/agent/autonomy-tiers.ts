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
    blurb: "Never sends replies or acts on Shopify. I draft everything for you.",
  },
  {
    id: "guarded",
    label: "Ask first",
    cap: 50,
    blurb: "Default. I handle routine replies and ask before changes, money, or exceptions.",
    recommended: true,
  },
  {
    id: "trusted",
    label: "Trusted",
    cap: 100,
    blurb: "Explicit opt-in. I can send simple replies on my own; refunds and cancellations still need approval.",
  },
];

export function visibleAutonomyTiers(): AutonomyTierOption[] {
  return AUTONOMY_TIERS;
}

export function effectiveRefundCap(settings: { autonomyTier?: AutonomyTier; maxRefundAmount?: number | null }): number {
  if (settings.maxRefundAmount != null) return settings.maxRefundAmount;
  return AUTONOMY_TIERS.find(option => option.id === settings.autonomyTier)?.cap ?? 50;
}
