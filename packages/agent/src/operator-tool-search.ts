import type Anthropic from "@anthropic-ai/sdk";

// Operator turns used to offer every tool they might need on every call, and those
// schemas were most of the cached prefix. With tool search the tools outside this
// set are still sent, but stay out of the billed, cached prefix until the model
// searches for one; what a search finds is appended to the conversation, so the
// prefix is not rewritten (changing the `tools` array mid-turn is what rewrites it).
//
// The set is what a phone turn reaches for first, chosen from AgentAction tool
// frequency on operator turns (2026-09-30): the customer, order and product reads,
// the controls that answer a pending plan or question, and the inbox. A tool the
// model has to search for costs an extra pass, so heavy, rarely used tools stay
// out, and the pending-plan controls stay in: they must never need a search before
// the merchant's "yes". Names the turn was not offered are ignored.
const CORE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "find_customer",
  "get_shopify_orders",
  "get_order_by_name",
  "get_order_status",
  "search_shopify_products",
  "search_kb",
  "approve_pending_plan",
  "reject_pending_plan",
  "revise_pending_plan",
  "answer_operator_question",
  "list_active_tickets",
  "get_ticket",
  "send_ticket_reply",
  "mark_ticket_spam",
  "navigate_dashboard",
]);

const TOOL_SEARCH_TOOL: Anthropic.ToolSearchToolRegex20251119 = {
  type: "tool_search_tool_regex_20251119",
  name: "tool_search_tool_regex",
};

export function resolveOperatorToolSearchMode(
  value: string | undefined = process.env.AGENT_OPERATOR_TOOL_SEARCH,
): "off" | "on" {
  if (value === undefined || value.trim() === "") return "off";
  if (value === "off" || value === "on") return value;
  throw new Error("AGENT_OPERATOR_TOOL_SEARCH must be off or on");
}

export function withOperatorToolSearch(
  tools: readonly Anthropic.Tool[],
): Anthropic.ToolUnion[] {
  return [
    TOOL_SEARCH_TOOL,
    ...tools.map((tool) => (
      CORE_TOOL_NAMES.has(tool.name) ? tool : { ...tool, defer_loading: true }
    )),
  ];
}
