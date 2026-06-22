import type { AgentActionApproval } from "./agent-actions.js";
import type { AgentActionMode } from "./agent-context.js";
import type { OrgSettings } from "./types.js";
import { resolveAgentSettings } from "./settings.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";

export const DEFAULT_MAX_ITERATIONS = 10;
export const READ_ONLY_MAX_ITERATIONS = 4;
export const TOKEN_BUDGET = 20_000;

export const READ_TOOL_NAMES = Object.entries(TOOL_CATEGORIES).flatMap(([name, category]) => (
  category === "read" ? [name] : []
));

export interface RunAgentPolicyOptions {
  readOnly?: boolean;
  mode?: AgentActionMode;
  approval?: AgentActionApproval;
}

export function resolveRunPolicy(settings?: OrgSettings, options?: RunAgentPolicyOptions) {
  const resolvedSettings = resolveAgentSettings(settings);
  const readOnly = options?.readOnly ?? false;
  const effectiveMode: AgentActionMode = options?.mode ?? (readOnly ? "read_only" : "human_approved");
  const approval = effectiveMode === "human_approved" ? options?.approval : undefined;
  const maxIterations = readOnly
    ? READ_ONLY_MAX_ITERATIONS
    : (resolvedSettings.maxIterations > 0 ? resolvedSettings.maxIterations : DEFAULT_MAX_ITERATIONS);

  return {
    approval,
    effectiveMode,
    maxIterations,
    readOnly,
    settings: resolvedSettings,
  };
}
