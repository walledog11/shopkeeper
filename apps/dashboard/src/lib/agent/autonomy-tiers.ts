import type { AutonomyTier } from "@shopkeeper/agent/settings";

export interface AutonomyTierOption {
  id: AutonomyTier;
  label: string;
  cap: number;
  blurb: string;
  recommended?: boolean;
  comingSoon?: boolean;
  merchantFacing?: boolean;
}

export const AUTONOMY_TIERS: AutonomyTierOption[] = [
  {
    id: "watch",
    label: "Draft only",
    cap: 0,
    blurb: "Never sends replies or acts on Shopify. I draft everything for you.",
    merchantFacing: true,
  },
  {
    id: "guarded",
    label: "Ask first",
    cap: 50,
    blurb: "Default. I plan each reply and action, then wait for your OK.",
    recommended: true,
    merchantFacing: true,
  },
  {
    id: "trusted",
    label: "Trusted",
    cap: 100,
    blurb: "Explicit opt-in. I can send simple replies on my own; refunds and cancellations still need approval.",
    merchantFacing: true,
  },
  {
    id: "broad",
    label: "Broad",
    cap: 250,
    blurb: "Refunds up to $250, bulk quotes, custom discount codes.",
    comingSoon: true,
  },
  {
    id: "full",
    label: "Full auto",
    cap: 1000,
    blurb: "I act on anything in policy. You only see exceptions.",
    comingSoon: true,
  },
];

const MERCHANT_TIER_IDS = new Set<AutonomyTier>(
  AUTONOMY_TIERS.filter(option => option.merchantFacing).map(option => option.id),
);

export function visibleAutonomyTiers(currentTier?: AutonomyTier): AutonomyTierOption[] {
  const merchantTiers = AUTONOMY_TIERS.filter(option => option.merchantFacing);
  if (!currentTier || MERCHANT_TIER_IDS.has(currentTier)) return merchantTiers;
  const legacyTier = AUTONOMY_TIERS.find(option => option.id === currentTier);
  return legacyTier ? [...merchantTiers, legacyTier] : merchantTiers;
}
