import type Anthropic from "@anthropic-ai/sdk";
import type { RawToolCall } from "./types.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";

export const REPLAN_INCLUDE_REPLY_PROMPT =
  "Plan the mutative action(s) AND send_reply in this single response. Do not stop after action tools alone.";

export const REPLAN_RETRY_PROMPT =
  "Your plan included action tools but no send_reply. Include send_reply in this response.";

export const POLICY_GAP_REPLAN_PROMPT =
  "No knowledge base article answers this store-policy question. Call ask_operator with one specific question for the merchant so you can reply to the customer — do not send_reply, do not tell the customer to contact the store on email or Instagram, and do not escalate unless the request is out of scope, fraud, or a safety issue.";

const POLICY_GAP_REPLAN_TOOL_NAMES = new Set([
  "ask_operator",
  "escalate_to_human",
  "search_kb",
  "add_internal_note",
]);

const REPLAN_RETRY_SUPPORT_TOOLS = new Set([
  "send_reply",
  "add_internal_note",
  "update_thread_status",
]);

/**
 * Phase-1 planning offers every tool except `send_reply`: the model can read,
 * escalate, or take a mutative action directly, but it cannot reply. That is the
 * one change from the full tool set — it stops a mutative ticket from bailing to
 * a bare reply (which would skip the action), while the customer reply is always
 * supplied by the terminal reply-draft phase. Any mutative call made here is
 * replaced by the replan output via `mergeReplanToolCalls` when a read runs, so
 * there is no double-action exposure.
 */
export function selectInitialPlanningTools(tools: Anthropic.Tool[]): Anthropic.Tool[] {
  return tools.filter((tool) => tool.name !== "send_reply");
}

/** Replan tools when KB was consulted but no article answers a store-policy question. */
export function selectPolicyGapReplanTools(tools: Anthropic.Tool[]): Anthropic.Tool[] {
  return tools.filter((tool) => (
    POLICY_GAP_REPLAN_TOOL_NAMES.has(tool.name)
    || TOOL_CATEGORIES[tool.name] === "read"
  ));
}

function keepPhase1ToolCall(toolCall: RawToolCall): boolean {
  return (
    TOOL_CATEGORIES[toolCall.name] === "read" ||
    toolCall.name === "escalate_to_human" ||
    toolCall.name === "ask_operator"
  );
}

/** Keep phase-1 reads/escalation; replan output replaces any mutative phase-1 calls. */
export function mergeReplanToolCalls(
  phase1Calls: RawToolCall[],
  replanCalls: RawToolCall[],
): RawToolCall[] {
  return [...phase1Calls.filter(keepPhase1ToolCall), ...replanCalls];
}

export function replanNeedsSendReplyRetry(
  blocks: Anthropic.ToolUseBlock[],
  options: { operatorMode: boolean; sendReplyAvailable: boolean },
): boolean {
  if (options.operatorMode || !options.sendReplyAvailable) return false;
  const toolNames = blocks.map((block) => block.name);
  if (toolNames.includes("send_reply") || toolNames.includes("escalate_to_human")) return false;
  return blocks.some((block) => TOOL_CATEGORIES[block.name] === "action");
}

export function selectReplanRetryTools(
  allTools: Anthropic.Tool[],
  firstReplanBlocks: Anthropic.ToolUseBlock[],
): Anthropic.Tool[] {
  const actionNames = new Set(
    firstReplanBlocks
      .filter((block) => TOOL_CATEGORIES[block.name] === "action")
      .map((block) => block.name),
  );
  return allTools.filter((tool) => actionNames.has(tool.name) || REPLAN_RETRY_SUPPORT_TOOLS.has(tool.name));
}
