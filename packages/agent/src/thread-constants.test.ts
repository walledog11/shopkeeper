import { describe, expect, it } from "vitest";
import {
  AGENT_NOTE_PREFIX,
  LEGACY_AGENT_NOTE_PREFIX,
  isAgentNoteContent,
  stripAgentNotePrefix,
} from "./thread-constants.js";

describe("agent note content prefixes", () => {
  it("detects new and legacy note prefixes", () => {
    expect(isAgentNoteContent(`${AGENT_NOTE_PREFIX}Escalated to merchant`)).toBe(true);
    expect(isAgentNoteContent(`${LEGACY_AGENT_NOTE_PREFIX}Escalated to merchant`)).toBe(true);
    expect(isAgentNoteContent("plain note")).toBe(false);
    expect(isAgentNoteContent(null)).toBe(false);
  });

  it("strips whichever prefix is present", () => {
    expect(stripAgentNotePrefix(`${AGENT_NOTE_PREFIX}Escalated`)).toBe("Escalated");
    expect(stripAgentNotePrefix(`${LEGACY_AGENT_NOTE_PREFIX}Escalated`)).toBe("Escalated");
    expect(stripAgentNotePrefix("plain note")).toBe("plain note");
  });
});
