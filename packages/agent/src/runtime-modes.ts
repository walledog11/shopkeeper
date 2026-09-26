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

export const LEGACY_AGENT_RUNTIME_VERSION = 1;
export const DURABLE_AGENT_RUNTIME_VERSION = 2;
export type AgentRuntimeVersion =
  | typeof LEGACY_AGENT_RUNTIME_VERSION
  | typeof DURABLE_AGENT_RUNTIME_VERSION;

/** The rollout choice persisted on a task when that task is created. */
export function resolveAgentRuntimeVersion(
  value: string | undefined = process.env.AGENT_RUNTIME_VERSION,
): AgentRuntimeVersion {
  if (value === undefined || value.trim() === "" || value === "1") {
    return LEGACY_AGENT_RUNTIME_VERSION;
  }
  if (value === "2") return DURABLE_AGENT_RUNTIME_VERSION;
  throw new Error("AGENT_RUNTIME_VERSION must be 1 or 2");
}

/** Selects the version only when a new task is created. The persisted task wins thereafter. */
export function resolveAgentRuntimeVersionForOrg(
  organizationId: string,
  globalVersion: string | undefined = process.env.AGENT_RUNTIME_VERSION,
  v2OrgIds: string | undefined = process.env.AGENT_RUNTIME_V2_ORG_IDS,
): AgentRuntimeVersion {
  const fallback = resolveAgentRuntimeVersion(globalVersion);
  const selected = v2OrgIds?.split(",").map(id => id.trim()).filter(Boolean) ?? [];
  if (selected.length === 0) return fallback;
  return selected.includes(organizationId) ? DURABLE_AGENT_RUNTIME_VERSION : LEGACY_AGENT_RUNTIME_VERSION;
}

export type ProposalSuspensionMode = "off" | "compose_from_receipt";

/**
 * The runtime v1 compatibility switch for the exact-draft proposal contract.
 * `compose_from_receipt` is the value's historical name: it used to stop
 * planning at the write and compose the reply after it. Decision A of the
 * overhaul plan replaced that — the merchant approves the exact message — so
 * the value now selects the exact-draft contract below. Off unless enabled.
 */
export function resolveProposalSuspensionMode(
  value: string | undefined = process.env.AGENT_PROPOSAL_SUSPENSION_MODE,
): ProposalSuspensionMode {
  if (value === undefined || value.trim() === "") return "off";
  if (value === "off" || value === "compose_from_receipt") return value;
  throw new Error("AGENT_PROPOSAL_SUSPENSION_MODE must be off or compose_from_receipt");
}

/**
 * Whether a plan binds its customer message into the proposal: the draft is
 * written before approval, shown on the card, hashed with the writes, and is
 * the only message the approval may send. A plan with no message authorizes
 * none.
 */
export function usesExactDraftProposals(runtimeVersion?: number): boolean {
  if (runtimeVersion !== undefined && runtimeVersion >= DURABLE_AGENT_RUNTIME_VERSION) return true;
  // Runtime v1 retains the pre-router feature flag until its callers have been
  // drained. That preserves already-configured workspaces while v2 becomes the
  // sole owner for newly routed tasks.
  return resolveProposalSuspensionMode() === "compose_from_receipt";
}

export type CapabilityDiscoveryMode = "off" | "discover";

/**
 * Whether planning runs on the discovery runtime: a classification it cannot
 * use takes the compact starter set instead of the whole registry, and a model
 * that needs a capability it was not given discovers it inside the same turn
 * instead of ending the attempt and re-planning against everything.
 *
 * The environment setting is the compatibility choice for taskless and v1
 * callers. Persisted v2 tasks select discovery from their immutable version.
 * What it changes is which schemas the model is offered, so legacy widening
 * stays reachable until those callers are retired.
 */
export function resolveCapabilityDiscoveryMode(
  value: string | undefined = process.env.AGENT_CAPABILITY_DISCOVERY_MODE,
): CapabilityDiscoveryMode {
  if (value === undefined || value.trim() === "") return "off";
  if (value === "off" || value === "discover") return value;
  throw new Error("AGENT_CAPABILITY_DISCOVERY_MODE must be off or discover");
}

export function usesCapabilityDiscovery(runtimeVersion?: number): boolean {
  if (runtimeVersion !== undefined && runtimeVersion >= DURABLE_AGENT_RUNTIME_VERSION) return true;
  return resolveCapabilityDiscoveryMode() === "discover";
}
