import type { AgentToolDefinition, MerchantFollowUp } from "./types.js";

export const MERCHANT_FOLLOW_UP_GUIDANCE =
  "A required merchant follow-up is outstanding work, not an action this tool schedules or a commitment the merchant has made. The approval card's reminder does not establish a customer promise. Store policy or an explicit merchant instruction can establish that commitment; without either, confirm the action's own result and leave the follow-up with the merchant.";

export function merchantFollowUpModelFacts(
  definition: Pick<AgentToolDefinition, "merchantFollowUp">,
): {
  kind: MerchantFollowUp;
  status: "requires_merchant";
  scheduledByTool: false;
  customerCommitmentEstablishedByTool: false;
} | null {
  return definition.merchantFollowUp ? {
    kind: definition.merchantFollowUp,
    status: "requires_merchant",
    scheduledByTool: false,
    customerCommitmentEstablishedByTool: false,
  } : null;
}

/** The model gets the same follow-up contract that the approval card renders. */
export function modelToolDescription(
  definition: Pick<AgentToolDefinition, "description" | "merchantFollowUp">,
): string {
  const followUp = merchantFollowUpModelFacts(definition);
  return followUp
    ? `${definition.description}\n\n${MERCHANT_FOLLOW_UP_GUIDANCE}\n${JSON.stringify({ merchant_follow_up: followUp })}`
    : definition.description;
}
