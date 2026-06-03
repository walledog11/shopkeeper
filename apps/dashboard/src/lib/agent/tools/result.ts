// Structured result every tool implementation returns. The executor and planner
// branch on `status`; `message` is the only text the model ever sees, so wording
// can change without touching control flow.
export type ToolStatus = "ok" | "error" | "not_found" | "escalated";

export interface ToolResult {
  status: ToolStatus;
  message: string;
  data?: unknown;
}

export function toolOk(message: string): ToolResult {
  return { status: "ok", message };
}

export function toolEscalated(reason: string): ToolResult {
  return { status: "escalated", message: reason };
}

export function toolError(message: string): ToolResult {
  return { status: "error", message };
}

export function toolNotFound(message: string): ToolResult {
  return { status: "not_found", message };
}
