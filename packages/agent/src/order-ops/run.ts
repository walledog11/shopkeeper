import type Anthropic from "@anthropic-ai/sdk";
import { buildCachedSystemPrompt, pickModel } from "../ai/index.js";
import logger from "../logger.js";
import type { OrgSettings } from "../types.js";
import { resolveAgentSettings } from "../settings.js";
import { runAgentLoop } from "../agent-loop.js";
import {
  selectAgentToolsForContext,
  TOOL_CATEGORIES,
  type AgentToolDefinition,
} from "../tools/registry/index.js";
import { defineTool, stringArg } from "../tools/registry/schema.js";
import { executeToolWithStatus } from "../tools/executor.js";
import { toolEscalated } from "../tools/result.js";
import { createModelUsageMetrics } from "../usage.js";
import { enforceSpendCap } from "../spend.js";
import { recordAgentActionsBatch } from "../agent-actions.js";
import type { ActionEntry } from "../agent-context.js";
import { buildOrderRiskPrompt } from "./prompt.js";
import type { OrderOpsContext } from "./context.js";

const MAX_ITERATIONS = 4;
const READ_TOOL_NAMES = ["get_shopify_customer", "get_order_tracking"] as const;

interface FlagOrderInput {
  reason: string;
}

// flag_order is the order-ops analogue of escalate_to_human: it routes through
// the injected escalate sink (which records a finding) rather than moving a
// thread to a human. A module tool — passed to the shared executor via
// moduleTools, never registered in the support tool set. capabilities is empty
// (it needs only ctx.escalate, present on every context) and categoryPermission
// is off so no workspace tool-toggle can hide the fraud backstop. A sink failure
// is logged, not thrown, so the finding still lands in the audit batch.
const FLAG_ORDER_TOOL = defineTool({
  name: "flag_order",
  description:
    "Flag this order for human fraud review. Call this only when the order shows a genuine risk pattern worth a person's attention.",
  fields: {
    reason: stringArg("Concise reason naming the risk signals that justify the flag.", { required: true }),
  },
  category: "action",
  group: "order",
  capabilities: [],
  label: "Flagged order for review",
  planStepLabel: "Flag order for review",
  policy: { categoryPermission: false },
  execute: async (input: FlagOrderInput, ctx) => {
    const reason = input.reason.trim() || "No reason provided";
    try {
      await ctx.escalate(reason);
    } catch (err) {
      logger.error({ err, orgId: ctx.orgId }, "[order-ops] escalate sink failed");
    }
    return toolEscalated(reason);
  },
});

const MODULE_TOOLS: Record<string, AgentToolDefinition> = { flag_order: FLAG_ORDER_TOOL };
const FLAG_ORDER_ANTHROPIC_TOOL: Anthropic.Tool = {
  name: FLAG_ORDER_TOOL.name,
  description: FLAG_ORDER_TOOL.description,
  input_schema: FLAG_ORDER_TOOL.inputSchema,
};

export interface OrderOpsResult {
  summary: string;
  flagged: boolean;
  flagReason: string | null;
  actionsPerformed: ActionEntry[];
}

export interface RunOrderOpsOptions {
  turnId?: string;
}

export async function runOrderOps(
  ctx: OrderOpsContext,
  settings?: OrgSettings,
  options?: RunOrderOpsOptions,
): Promise<OrderOpsResult> {
  // Deterministic pre-filter: the model only runs on flagged candidates. An
  // order with no pre-scan risk signals is skipped before any model call - no
  // spend, no finding.
  if (ctx.order.riskSignals.length === 0) {
    logger.info({ orgId: ctx.orgId, orderId: ctx.order.id }, "[order-ops] no risk signals - skipped");
    return {
      summary: "No pre-scan risk signals - not reviewed.",
      flagged: false,
      flagReason: null,
      actionsPerformed: [],
    };
  }

  const startedAt = Date.now();
  const s = resolveAgentSettings(settings);
  const usageTotals = createModelUsageMetrics();
  const actionsPerformed: ActionEntry[] = [];
  let flagReason: string | null = null;

  // Configuration over the shared loop: capability-filtered read tools (this
  // thread-less context provides `shopify`, not `thread-io`) plus flag_order.
  const tools = selectAgentToolsForContext(ctx, settings, READ_TOOL_NAMES).concat(FLAG_ORDER_ANTHROPIC_TOOL);
  const systemPromptBlocks = buildCachedSystemPrompt(buildOrderRiskPrompt(ctx, settings));
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: "Review the order under review and decide whether to flag it." },
  ];

  // Same dispatch path as support (the shared executor): reads run for real,
  // flag_order runs as an injected module tool. Records an audit row per call and
  // surfaces the flag as an escalation so the loop stops once the model decides.
  const runTools = async (
    toolCalls: { id: string; name: string; input: unknown }[],
  ): Promise<Anthropic.ToolResultBlockParam[]> => {
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolCalls) {
      const toolStartedAt = Date.now();
      let result: string;
      let status: ActionEntry["status"];
      try {
        const executed = await executeToolWithStatus(call.name, call.input, ctx, settings, MODULE_TOOLS);
        result = executed.result;
        status = executed.status;
      } catch (err) {
        result = `Error: tool "${call.name}" threw - ${err instanceof Error ? err.message : String(err)}`;
        status = "error";
        logger.error({ err, orgId: ctx.orgId, orderId: ctx.order.id, tool: call.name }, "[order-ops] tool error");
      }
      if (call.name === "flag_order" && status === "escalated") {
        flagReason = result.trim() || "No reason provided";
      }
      actionsPerformed.push({
        tool: call.name,
        result,
        input: call.input,
        durationMs: Date.now() - toolStartedAt,
        status,
        category: call.name === "flag_order" ? "action" : (TOOL_CATEGORIES[call.name] ?? "read"),
      });
      results.push({ type: "tool_result", tool_use_id: call.id, content: result });
    }
    return results;
  };

  // Spend cap backstop — check once before the model loop. Orders with no risk
  // signals return above with zero model calls and stay ungated.
  await enforceSpendCap(ctx.orgId, s);

  const loop = await runAgentLoop({
    ctx,
    mode: "execute",
    messages,
    systemPromptBlocks,
    tools,
    model: pickModel("agent_run"),
    maxIterations: MAX_ITERATIONS,
    maxTokensPerCall: 1024,
    settings,
    usageTotals,
    runTools,
    getEscalationReason: () => flagReason,
  });

  const flagged = flagReason !== null;
  const summary = flagged
    ? `Flagged order ${ctx.order.name} for review: ${flagReason}`
    : loop.stop === "max_iterations"
      ? "Reached maximum steps without a decision."
      : (loop.finalText?.trim() || "No action - order looks normal.");
  const outcome = flagged ? "flagged" : loop.stop;

  if (actionsPerformed.length > 0) {
    try {
      await recordAgentActionsBatch({
        orgId: ctx.orgId,
        threadId: null,
        customerId: null,
        mode: "auto_executed",
        actions: actionsPerformed,
        instruction: `order-risk-review:${ctx.order.id}`,
        summary,
        ...(options?.turnId ? { turnId: options.turnId } : {}),
      });
    } catch (err) {
      logger.error({ err, orgId: ctx.orgId, orderId: ctx.order.id }, "[order-ops] failed to persist audit rows");
    }
  }

  logger.info({
    orgId: ctx.orgId,
    orderId: ctx.order.id,
    purpose: "order_risk_review",
    outcome,
    flagged,
    durationMs: Date.now() - startedAt,
    iterations: loop.iterations,
    loopStop: loop.stop,
    usageTotals,
    actionCount: actionsPerformed.length,
  }, "[order-ops] run complete");

  return { summary, flagged, flagReason, actionsPerformed };
}
