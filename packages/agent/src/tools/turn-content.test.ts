import { describe, expect, it } from "vitest";
import {
  AGENT_TURN_PREFIX,
  LEGACY_AGENT_TURN_PREFIX,
  getAgentTurnPrefixLength,
  isAgentTurnContent,
} from "./turn-content.js";

describe("agent turn content prefixes", () => {
  it("detects new and legacy turn prefixes", () => {
    expect(isAgentTurnContent(`${AGENT_TURN_PREFIX}{}`)).toBe(true);
    expect(isAgentTurnContent(`${LEGACY_AGENT_TURN_PREFIX}{}`)).toBe(true);
    expect(isAgentTurnContent("plain text")).toBe(false);
    expect(isAgentTurnContent(null)).toBe(false);
  });

  it("returns the matching prefix length for parsing", () => {
    const payload = '{"instruction":"Handle this"}';
    expect(getAgentTurnPrefixLength(`${AGENT_TURN_PREFIX}${payload}`)).toBe(AGENT_TURN_PREFIX.length);
    expect(getAgentTurnPrefixLength(`${LEGACY_AGENT_TURN_PREFIX}${payload}`)).toBe(
      LEGACY_AGENT_TURN_PREFIX.length,
    );
    expect(getAgentTurnPrefixLength("plain text")).toBeNull();
  });
});
