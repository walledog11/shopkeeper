// Structured result every tool implementation returns. The executor and planner
// branch on `status`; `message` is the only text the model ever sees, so wording
// can change without touching control flow.
export type ToolStatus = "ok" | "error" | "not_found" | "policy_block" | "escalated" | "unknown";

export interface ToolResult {
  status: ToolStatus;
  message: string;
  data?: unknown;
}

export function toolOk(message: string, data?: unknown): ToolResult {
  return data === undefined ? { status: "ok", message } : { status: "ok", message, data };
}

export function toolEscalated(reason: string): ToolResult {
  return { status: "escalated", message: reason };
}

export function toolError(message: string): ToolResult {
  return { status: "error", message };
}

export function toolPolicyBlock(message: string, data?: unknown): ToolResult {
  return data === undefined
    ? { status: "policy_block", message }
    : { status: "policy_block", message, data };
}

export function toolUnknown(message: string): ToolResult {
  return { status: "unknown", message };
}

export function toolNotFound(message: string): ToolResult {
  return { status: "not_found", message };
}
