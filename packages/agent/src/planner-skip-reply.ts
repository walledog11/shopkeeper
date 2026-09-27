import type { RawToolCall } from "./types.js";

// The terminal send tools whose bodies the skip flow re-drafts. `send_reply` /
// `send_email` are the only tools whose copy describes the plan's actions and so
// must be regenerated when the merchant skips a step.
const TERMINAL_SEND_TOOLS = new Set(["send_reply", "send_email"]);

export function findTerminalSendTool(toolCalls: RawToolCall[]): RawToolCall | undefined {
  return toolCalls.find((toolCall) => TERMINAL_SEND_TOOLS.has(toolCall.name));
}
