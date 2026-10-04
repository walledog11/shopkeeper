import type { ActionEntry } from "@shopkeeper/agent/context";
import { TOOL_CATEGORIES, TOOL_LABELS, PLAN_STEP_LABELS } from "@shopkeeper/agent/tools";

export type ToolChipVariant = "read" | "executed" | "pending" | "error";

export function getToolChipLabel(action: ActionEntry): string {
  const actionLabel = PLAN_STEP_LABELS[action.tool] ?? action.tool;
  if (action.status === "policy_block") return `Blocked: ${actionLabel}`;
  if (action.status === "unknown") return `Needs review: ${actionLabel}`;
  if (action.status === "error") return `Failed: ${actionLabel}`;
  return TOOL_LABELS[action.tool] ?? action.tool;
}

export function getToolChipVariant(action: ActionEntry): ToolChipVariant {
  if (action.status === "error" || action.status === "unknown" || action.result.startsWith("Error") || action.result.startsWith("Unknown:")) return "error";

  const category = action.category ?? TOOL_CATEGORIES[action.tool];
  if (category === "read" || category === "internal" || action.mode === "read_only") return "read";

  if (action.status === "policy_block") return "pending";
  if (action.mode === "auto_executed" || action.mode === "human_approved") return "executed";

  if (category === "action" || category === "communication") return "pending";

  return "read";
}

export const TOOL_CHIP_CLASS: Record<ToolChipVariant, string> = {
  read: "bg-muted/50 text-muted-foreground border border-border/60",
  executed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-600",
  pending: "bg-amber-600/10 text-amber-700 dark:text-amber-600 border border-amber-600/25",
  error: "bg-red-500/10 text-red-600",
};
