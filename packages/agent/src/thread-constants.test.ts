import { describe, expect, it } from "vitest";
import {
  AGENT_NOTE_PREFIX,
  isAgentNoteContent,
  stripAgentNotePrefix,
} from "./thread-constants.js";

describe("agent note content prefixes", () => {
  it("detects the note prefix", () => {
    expect(isAgentNoteContent(`${AGENT_NOTE_PREFIX}Escalated to merchant`)).toBe(true);
    expect(isAgentNoteContent("plain note")).toBe(false);
    expect(isAgentNoteContent(null)).toBe(false);
  });

  it("strips the prefix when present", () => {
    expect(stripAgentNotePrefix(`${AGENT_NOTE_PREFIX}Escalated`)).toBe("Escalated");
    expect(stripAgentNotePrefix("plain note")).toBe("plain note");
  });
});
