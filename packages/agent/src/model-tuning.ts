// Per-call thinking and effort settings for the agent loop.
//
// Until now the loop sent neither parameter, which meant it inherited whatever
// the model's defaults happened to be — and those changed underneath it. On
// Sonnet 4.6, omitting `thinking` meant thinking was OFF. On Sonnet 5, omitting
// it runs ADAPTIVE thinking, and `effort` defaults to `high`. So the model-id
// bump to `claude-sonnet-5` silently turned on adaptive thinking at high effort
// across every planner iteration and every operator turn. Nobody chose that;
// it arrived with a rename. This module makes the choice explicit.
//
// Model-aware by necessity, not by preference: `effort` is rejected outright by
// Haiku 4.5, so sending it there would 400 every plan routed to the cheap tier
// (see planner-model-tier.ts). Anything not known to support a knob gets the
// parameter omitted rather than guessed.

import { HAIKU_MODEL, SONNET_MODEL } from "./ai/index.js";
import type { ToolExecMode } from "./agent-loop.js";

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

const EFFORT_LEVELS: ReadonlySet<string> = new Set<EffortLevel>([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export type PlannerThinkingMode = "disabled" | "adaptive";

/**
 * Which models accept which knobs. Keyed by exact model id so a future model
 * bump has to come through here — the whole point of this module is that the
 * last one didn't.
 */
const MODEL_SUPPORT: Record<string, { effort: boolean; thinking: boolean }> = {
  [SONNET_MODEL]: { effort: true, thinking: true },
  // Haiku 4.5 predates both parameters. `effort` returns 400, and thinking is
  // off unless explicitly enabled with the retired budget_tokens form — so the
  // correct call for the cheap tier is to send neither and take the default.
  [HAIKU_MODEL]: { effort: false, thinking: false },
};

/**
 * Effort for every agent-loop call. `medium` rather than the API default of
 * `high`: on Sonnet 5, medium is roughly Sonnet 4.6 at high, which is the
 * quality bar this product was built and eval-gated against.
 */
export function resolveModelEffort(
  value: string | undefined = process.env.AGENT_MODEL_EFFORT,
): EffortLevel {
  if (value === undefined || value.trim() === "") return "medium";
  if (EFFORT_LEVELS.has(value)) return value as EffortLevel;
  throw new Error(`AGENT_MODEL_EFFORT must be one of ${[...EFFORT_LEVELS].join(", ")}`);
}

/**
 * Thinking on the planning loop only.
 *
 * `disabled` is the cheaper setting — thinking bills as output tokens at
 * $15/MTok on Sonnet 5. It carries a documented risk on this model: with
 * thinking off, Sonnet 5 reaches for tools less readily, and planning is
 * entirely tool-driven (search the KB, read the order, then reply). If plans
 * come back thin or skip reads they used to make, set this to `adaptive` and
 * take the saving from effort alone — that combination is the vendor's own
 * recommendation for callers who would otherwise disable thinking.
 */
export function resolvePlannerThinking(
  value: string | undefined = process.env.AGENT_PLANNER_THINKING,
): PlannerThinkingMode {
  if (value === undefined || value.trim() === "") return "disabled";
  if (value === "disabled" || value === "adaptive") return value;
  throw new Error("AGENT_PLANNER_THINKING must be disabled or adaptive");
}

export interface ModelTuning {
  output_config?: { effort: EffortLevel };
  thinking?: { type: "disabled" } | { type: "adaptive" };
}

/**
 * The tuning parameters to spread into a `messages.create` call.
 *
 * Thinking is set on planning (`capture`) only. Execute and read-only turns keep
 * the model default: execution runs approved mutative work and operator turns
 * are conversational judgment, neither of which is a place to trade reasoning
 * depth for tokens without an eval behind it.
 */
export function resolveModelTuning(
  model: string,
  mode: ToolExecMode,
  overrides: { effort?: EffortLevel; plannerThinking?: PlannerThinkingMode } = {},
): ModelTuning {
  const support = MODEL_SUPPORT[model];
  if (!support) return {};

  const tuning: ModelTuning = {};
  if (support.effort) {
    tuning.output_config = { effort: overrides.effort ?? resolveModelEffort() };
  }
  if (support.thinking && mode === "capture") {
    const thinking = overrides.plannerThinking ?? resolvePlannerThinking();
    tuning.thinking = { type: thinking };
  }
  return tuning;
}
