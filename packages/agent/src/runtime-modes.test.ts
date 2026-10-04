import { afterEach, describe, expect, it, vi } from "vitest";
import { requireDurableAgentRuntime } from "./runtime-modes.js";

afterEach(() => vi.unstubAllEnvs());

describe("retired runtime boundary", () => {
  it("accepts v2 even when old rollout settings remain in the environment", () => {
    vi.stubEnv("AGENT_RUNTIME_VERSION", "1");
    vi.stubEnv("AGENT_RUNTIME_V2_ORG_IDS", "another-org");
    vi.stubEnv("AGENT_CAPABILITY_DISCOVERY_MODE", "off");
    vi.stubEnv("AGENT_PROPOSAL_SUSPENSION_MODE", "off");
    expect(() => requireDurableAgentRuntime()).not.toThrow();
    expect(() => requireDurableAgentRuntime(2)).not.toThrow();
  });

  it("refuses executing a persisted task from an unsupported runtime", () => {
    expect(() => requireDurableAgentRuntime(1)).toThrow(/retired agent runtime/);
    expect(() => requireDurableAgentRuntime(3)).toThrow(/retired agent runtime/);
  });
});
