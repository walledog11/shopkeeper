import { TOOL_CATEGORIES } from "../tools/registry/index.js"
import type { RawToolCall } from "../types.js"

// Support guidance permits an internal note only to document a real action.
// Models occasionally treat a reply or a refused injection as an action and
// persist an unnecessary note. Keep notes attached to action plans and remove
// every orphan before routing or execution.
export function stripInternalNotesWithoutActions(
  rawToolCalls: readonly RawToolCall[],
): RawToolCall[] {
  const hasAction = rawToolCalls.some(call => TOOL_CATEGORIES[call.name] === "action")
  return hasAction
    ? [...rawToolCalls]
    : rawToolCalls.filter(call => call.name !== "add_internal_note")
}
