/**
 * The migration's runtime gates, in one module because both the planner and the
 * prompt have to agree with them.
 *
 * They started in `planner.ts`, which the prompt cannot import — the planner
 * imports the prompt. Leaving them there and reading the environment a second
 * time inside the prompt would give the two halves of the same turn separate
 * copies of the same decision, which is how a prompt comes to describe a tool
 * the model was not offered.
 */

export type ProposalSuspensionMode = "off" | "compose_from_receipt";

/**
 * Whether support planning stops at the proposal and lets the reply be composed
 * from the receipt, for the callers that produce the plan behind an approval
 * card. Off unless explicitly enabled: it changes what the merchant is shown to
 * approve — actions without the draft reply that travels with a plan today — so
 * it is the gate that lets the slice merge before the cutover chooses a default.
 */
export function resolveProposalSuspensionMode(
  value: string | undefined = process.env.AGENT_PROPOSAL_SUSPENSION_MODE,
): ProposalSuspensionMode {
  if (value === undefined || value.trim() === "") return "off";
  if (value === "off" || value === "compose_from_receipt") return value;
  throw new Error("AGENT_PROPOSAL_SUSPENSION_MODE must be off or compose_from_receipt");
}

export function suspendsAtProposal(): boolean {
  return resolveProposalSuspensionMode() === "compose_from_receipt";
}

export type CapabilityDiscoveryMode = "off" | "discover";

/**
 * Whether planning runs on the discovery runtime: a classification it cannot
 * use takes the compact starter set instead of the whole registry, and a model
 * that needs a capability it was not given discovers it inside the same turn
 * instead of ending the attempt and re-planning against everything.
 *
 * Off unless explicitly enabled, like every other gate on this migration. What
 * it changes is which schemas the model is offered, so the legacy widening has
 * to stay reachable until the cutover chooses a default.
 */
export function resolveCapabilityDiscoveryMode(
  value: string | undefined = process.env.AGENT_CAPABILITY_DISCOVERY_MODE,
): CapabilityDiscoveryMode {
  if (value === undefined || value.trim() === "") return "off";
  if (value === "off" || value === "discover") return value;
  throw new Error("AGENT_CAPABILITY_DISCOVERY_MODE must be off or discover");
}

export function usesCapabilityDiscovery(): boolean {
  return resolveCapabilityDiscoveryMode() === "discover";
}
