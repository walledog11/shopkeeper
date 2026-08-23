import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import type { RawToolCall } from "./types.js";

/** Materialize a deterministic, system-authored escalation without retaining
 * any model-authored mutation or escalation claim. */
export function applyEscalationRouting(
  rawToolCalls: readonly RawToolCall[],
  reason: string,
  options?: { keepReply?: boolean },
): RawToolCall[] {
  const kept = rawToolCalls.filter((toolCall) => (
    TOOL_CATEGORIES[toolCall.name] === "read"
    || (options?.keepReply === true && toolCall.name === "send_reply")
  ));
  return [
    ...kept,
    { id: "tu_route_escalate", name: "escalate_to_human", input: { reason } },
  ];
}
