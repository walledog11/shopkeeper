import type { AutonomyTier } from "@shopkeeper/agent/settings";

export interface RoutineReplyChoice {
  tier: AutonomyTier;
  label: string;
  detail: string;
  recommended?: boolean;
}

/**
 * The one question settings ask about autonomy: may the agent send routine
 * replies on its own? Refunds, cancellations and order changes wait for the
 * merchant's OK either way.
 */
export const ROUTINE_REPLY_CHOICES: readonly RoutineReplyChoice[] = [
  { tier: "guarded", label: "Yes, answer them", detail: "Routine replies go out on their own.", recommended: true },
  { tier: "watch", label: "No, show me every reply first", detail: "Every reply waits for your OK." },
];

/** A workspace stored on the retired "trusted" level reads as the yes. */
export function routineReplyChoice(tier: AutonomyTier | undefined): RoutineReplyChoice {
  return ROUTINE_REPLY_CHOICES.find((choice) => choice.tier === tier) ?? ROUTINE_REPLY_CHOICES[0];
}
