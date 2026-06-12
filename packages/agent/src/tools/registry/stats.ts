import { toolOk } from "../result.js";
import { SUPPORT_STATS_DEFAULT_DAYS, SUPPORT_STATS_MAX_DAYS, clampSupportStatsDays } from "../support-stats-types.js";
import { defineTool, numberArg } from "./schema.js";
import type { SupportStatsInput } from "./types.js";

export const STATS_TOOL_DEFINITIONS = [
  defineTool({
    name: "get_support_stats",
    description:
      "Summarize support activity over the last N days: ticket volume by day, topic, and channel, message counts by sender, and average resolution time. Use this for questions like 'how many tickets came in last week?' or 'what were customers asking about this month?'.",
    fields: {
      days: numberArg(`Number of days to look back (1-${SUPPORT_STATS_MAX_DAYS}). Use ${SUPPORT_STATS_DEFAULT_DAYS} for 'this week', 30 for 'this month'.`, { required: true }),
    },
    category: "read",
    group: "insights",
    label: "Summarized support activity",
    planStepLabel: "Summarize support activity",
    execute: async (input: SupportStatsInput, ctx, _settings, deps) => {
      const stats = await deps.getSupportStats(ctx.orgId, clampSupportStatsDays(input.days));
      return toolOk(JSON.stringify(stats));
    },
  }),
] as const;
