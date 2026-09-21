import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DURABLE_AGENT_RUNTIME_VERSION,
  LEGACY_AGENT_RUNTIME_VERSION,
  resolveAgentRuntimeVersion,
  suspendsAtProposal,
  usesCapabilityDiscovery,
} from "./runtime-modes.js";

afterEach(() => vi.unstubAllEnvs());

describe("agent runtime routing", () => {
  it("keeps new tasks legacy unless rollout explicitly selects v2", () => {
    expect(resolveAgentRuntimeVersion(undefined)).toBe(LEGACY_AGENT_RUNTIME_VERSION);
    expect(resolveAgentRuntimeVersion("1")).toBe(LEGACY_AGENT_RUNTIME_VERSION);
    expect(resolveAgentRuntimeVersion("2")).toBe(DURABLE_AGENT_RUNTIME_VERSION);
    expect(() => resolveAgentRuntimeVersion("latest")).toThrow(/must be 1 or 2/);
  });

  it("derives proposal suspension from the persisted task version", () => {
    vi.stubEnv("AGENT_PROPOSAL_SUSPENSION_MODE", "off");
    expect(suspendsAtProposal(LEGACY_AGENT_RUNTIME_VERSION)).toBe(false);
    expect(suspendsAtProposal(DURABLE_AGENT_RUNTIME_VERSION)).toBe(true);
    vi.stubEnv("AGENT_PROPOSAL_SUSPENSION_MODE", "compose_from_receipt");
    expect(suspendsAtProposal(LEGACY_AGENT_RUNTIME_VERSION)).toBe(true);
  });

  it("enables bounded discovery from the persisted v2 task version", () => {
    vi.stubEnv("AGENT_CAPABILITY_DISCOVERY_MODE", "off");
    expect(usesCapabilityDiscovery(LEGACY_AGENT_RUNTIME_VERSION)).toBe(false);
    expect(usesCapabilityDiscovery(DURABLE_AGENT_RUNTIME_VERSION)).toBe(true);
    vi.stubEnv("AGENT_CAPABILITY_DISCOVERY_MODE", "discover");
    expect(usesCapabilityDiscovery(LEGACY_AGENT_RUNTIME_VERSION)).toBe(true);
  });
});
