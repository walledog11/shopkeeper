/** Which planner phases ran — used in `[agent:plan] complete` telemetry. */
export type PlanPath =
  | "fast-path"
  | "1-call"
  | "2-call-mutative";

export function derivePlanPath(input: {
  fastPath?: boolean;
  ranReplan: boolean;
}): PlanPath {
  if (input.fastPath) return "fast-path";
  if (input.ranReplan) return "2-call-mutative";
  return "1-call";
}
