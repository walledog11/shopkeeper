import { getToolDefinition } from "./tools/registry/index.js";
import type { MerchantFollowUp } from "./tools/registry/types.js";

/**
 * The work these tools leave for the merchant that none of them does: a return
 * with no label attached still needs the merchant to send one. The one owner of
 * that judgment for the planner, both approval cards and the confirmation.
 */
export function outstandingMerchantFollowUps(toolNames: Iterable<string>): MerchantFollowUp[] {
  const left = new Set<MerchantFollowUp>();
  const done = new Set<MerchantFollowUp>();
  for (const name of toolNames) {
    const definition = getToolDefinition(name);
    if (definition?.merchantFollowUp) left.add(definition.merchantFollowUp);
    if (definition?.completesMerchantFollowUp) done.add(definition.completesMerchantFollowUp);
  }
  return [...left].filter((followUp) => !done.has(followUp));
}

// `who` is how the surface already names the customer ("Chain", "them").
const FOLLOW_UP_COPY: Record<MerchantFollowUp, {
  beforeApproval: (who: string) => string;
  afterExecution: (who: string) => string;
}> = {
  send_return_label: {
    beforeApproval: (who) => `I can't create return labels, so you'll need to send ${who} one yourself.`,
    afterExecution: (who) => `Send ${who} a return label yourself; I can't create one.`,
  },
};

export function merchantFollowUpBeforeApproval(followUp: MerchantFollowUp, who: string): string {
  return FOLLOW_UP_COPY[followUp].beforeApproval(who);
}

export function merchantFollowUpAfterExecution(followUp: MerchantFollowUp, who: string): string {
  return FOLLOW_UP_COPY[followUp].afterExecution(who);
}
