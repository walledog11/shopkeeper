import type { AutonomyTier } from "@shopkeeper/agent/settings";
import { AUTONOMY_TIERS } from "@/lib/agent/autonomy-tiers";

const IRREVERSIBLE_NOTE = "Refunds and cancellations always need your OK.";

const TIER_DETAIL: Partial<Record<AutonomyTier, string>> = {
  watch: "I draft everything — nothing goes out without you.",
  guarded: "I ask before refunds and cancellations.",
  trusted: "Simple replies on my own; refunds and cancellations still need OK.",
};

export function buildPanelTrustLine(tier: AutonomyTier): { label: string; detail: string } {
  const option = AUTONOMY_TIERS.find((entry) => entry.id === tier);
  const label = option?.label ?? tier;
  const detail = TIER_DETAIL[tier] ?? option?.blurb ?? IRREVERSIBLE_NOTE;

  return { label, detail };
}
