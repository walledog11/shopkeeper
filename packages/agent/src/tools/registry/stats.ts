import { toolOk } from "../result.js";
import { clampSupportStatsDays } from "../support-stats-types.js";
import { defineTool } from "./schema.js";
import { TOOL_INPUT_FIELDS } from "./input-fields.js";

export const STATS_TOOL_DEFINITIONS = [
  defineTool({
    name: "get_support_stats",
    description:
      "Summarize support activity over the last N days: ticket volume by day, topic, and channel, message counts by sender, and average resolution time. Use this for questions like 'how many tickets came in last week?' or 'what were customers asking about this month?'.",
    fields: TOOL_INPUT_FIELDS.get_support_stats,
    category: "read",
    group: "insights",
    capabilities: ["stats"],
    label: "Summarized support activity",
    planStepLabel: "Summarize support activity",
    execute: async (input, ctx, _settings, deps) => {
      const stats = await deps.getSupportStats(ctx.orgId, clampSupportStatsDays(input.days));
      return toolOk(JSON.stringify(stats));
    },
  }),
] as const;
