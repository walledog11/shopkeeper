import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, buildCachedSystemPrompt, pickModel } from "../ai/index.js";
import logger from "../logger.js";
import type { OrgSettings } from "../types.js";
import { resolveAgentSettings } from "../settings.js";
import { selectAgentTools, type GetShopifyCustomerInput, type GetOrderTrackingInput } from "../tools/index.js";
import { getShopifyCustomer, getOrderTracking } from "../shopify/index.js";
import { createModelUsageMetrics, recordModelUsage } from "../usage.js";
import { enforceSpendCap, recordSpend } from "../spend.js";
import { recordAgentActionsBatch } from "../agent-actions.js";
import type { ActionEntry } from "../agent-context.js";
import { buildOrderRiskPrompt } from "./prompt.js";
import type { OrderOpsContext } from "./context.js";

const MAX_ITERATIONS = 4;
const READ_TOOL_NAMES = ["get_shopify_customer", "get_order_tracking"] as const;

// The flag/escalate sink for a thread-less run. escalateToHuman (tools/thread.ts)
// could NOT be reused: it sets a thread -> pending, tags it needs_human, and
// pushes to the gateway operator queue - all thread-shaped. The order-ops analogue
// just records a structured finding (no thread to move).
const FLAG_ORDER_TOOL: Anthropic.Tool = {
  name: "flag_order",
  description: "Flag this order for human fraud review. Call this only when the order shows a genuine risk pattern worth a person's attention.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Concise reason naming the risk signals that justify the flag." },
    },
    required: ["reason"],
  },
};

interface FlagOrderInput {
  reason: string;
}

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
  // Deterministic pre-filter (Track 3): the model only runs on flagged
  // candidates. An order with no pre-scan risk signals is skipped before any
  // model call - no spend, no finding.
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

  const tools = selectAgentTools(settings, READ_TOOL_NAMES as unknown as string[]).concat(FLAG_ORDER_TOOL);
  const systemPromptBlocks = buildCachedSystemPrompt(buildOrderRiskPrompt(ctx, settings));
  const model = pickModel("agent_run");

  // Forked tool dispatch. The shared executor (tools/executor.ts) builds
  // threadCtx = { threadId: ctx.thread.id, ... } eagerly at the top of every
  // call, so it throws on a thread-less context before any Shopify-only tool
  // runs. This minimal dispatcher reuses the Shopify tool implementations
  // directly (they only read ctx.shopify) and routes flag_order to the sink.
  const dispatchTool = async (name: string, input: unknown): Promise<{ result: string; status: ActionEntry["status"] }> => {
    if (name === "flag_order") {
      flagReason = (input as FlagOrderInput).reason?.trim() || "No reason provided";
      // Seam 2: route the flag through the injected sink. A sink failure must
      // not fail the run or lose the finding (persisted in finish()), so it is
      // logged, not thrown.
      try {
        await ctx.escalate(flagReason);
      } catch (err) {
        logger.error({ err, orgId: ctx.orgId, orderId: ctx.order.id }, "[order-ops] escalate sink failed");
      }
      return { result: `Order flagged for human review: ${flagReason}`, status: "success" };
    }
    if (!ctx.shopify) return { result: "Error: no Shopify integration connected.", status: "error" };
    if (name === "get_shopify_customer") {
      const r = await getShopifyCustomer(input as GetShopifyCustomerInput, ctx.shopify);
      return { result: r.message, status: r.status === "error" ? "error" : "success" };
    }
    if (name === "get_order_tracking") {
      const r = await getOrderTracking(input as GetOrderTrackingInput, ctx.shopify);
      return { result: r.message, status: r.status === "error" ? "error" : "success" };
    }
    return { result: `Error: unknown tool "${name}".`, status: "error" };
  };

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: "Review the order under review and decide whether to flag it." },
  ];

  const finish = async (summary: string, outcome: string): Promise<OrderOpsResult> => {
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
      outcome,
      flagged: flagReason !== null,
      durationMs: Date.now() - startedAt,
      usageTotals,
      actionCount: actionsPerformed.length,
    }, "[order-ops] run complete");
    return { summary, flagged: flagReason !== null, flagReason, actionsPerformed };
  };

  const runIteration = async (i: number): Promise<OrderOpsResult> => {
    if (i >= MAX_ITERATIONS) {
      return finish("Reached maximum steps without a decision.", "max_iterations");
    }

    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPromptBlocks,
      messages,
      tools,
    });

    const usage = recordModelUsage(usageTotals, response);
    await recordSpend(ctx.orgId, usage, model);
    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      return finish(textBlock?.text?.trim() || "No action - order looks normal.", "end_turn");
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const startedToolAt = Date.now();
      const { result, status } = await dispatchTool(block.name, block.input);
      actionsPerformed.push({
        tool: block.name,
        result,
        input: block.input,
        durationMs: Date.now() - startedToolAt,
        status,
        category: block.name === "flag_order" ? "action" : "read",
      });
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }
    messages.push({ role: "user", content: toolResults });

    if (flagReason !== null) {
      return finish(`Flagged order ${ctx.order.name} for review: ${flagReason}`, "flagged");
    }

    return runIteration(i + 1);
  };

  // Spend cap backstop — check once before the model loop. Orders with no risk
  // signals return above with zero model calls and stay ungated.
  await enforceSpendCap(ctx.orgId, s);
  return runIteration(0);
}
