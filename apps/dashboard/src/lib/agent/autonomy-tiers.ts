import type { AutonomyTier } from "@shopkeeper/agent/settings";

export interface AutonomyTierOption {
  id: AutonomyTier;
  label: string;
  cap: number;
  blurb: string;
  recommended?: boolean;
  comingSoon?: boolean;
}

export const AUTONOMY_TIERS: AutonomyTierOption[] = [
  { id: "watch", label: "Watch only", cap: 0, blurb: "I'll draft every reply for you. You hit send." },
  { id: "guarded", label: "Guarded", cap: 50, blurb: "I send WISMO and KB-backed replies. Anything > $50 needs you." },
  {
    id: "trusted",
    label: "Trusted",
    cap: 100,
    blurb: "Refunds up to $100, exchanges, address changes. Bulk inquiries pause for you.",
    recommended: true,
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
