import type Anthropic from "@anthropic-ai/sdk";
import logger from "./logger.js";
import type { OrgSettings } from "./types.js";
import { executeToolStructured } from "./tools/executor.js";
import type { ToolStatus } from "./tools/result.js";
import type { AgentContext, ShopifyOrderSummary } from "./agent-context.js";
import {
  applySkippedPlanningReadResults,
  normalizePlanningOrderName,
} from "./planner-read-skip.js";

export {
  partitionPlanningReadBlocks,
  shouldSkipPlanningRead,
  synthesizeSkippedPlanningReadResult,
} from "./planner-read-skip.js";

type PlanningReadToolResult = {
  readToolCalls: string[];
  readResultsMap: Map<string, string>;
  readStatusMap: Map<string, ToolStatus>;
};

function normalizeOrderName(name: string): string {
  return normalizePlanningOrderName(name);
}

// Whether the order a lookup tool was asked about is already in the planning
// context. If so, a live not-found is fixture/timing noise, not a real "order
// not found", and must not raise the warning that downgrades the auto-execute
// classifier.
function orderAlreadyInContext(block: Anthropic.ToolUseBlock, recentOrders: ShopifyOrderSummary[]): boolean {
  if (recentOrders.length === 0) return false;
  if (block.name === "get_order_by_name") {
    const requested = (block.input as { order_name?: unknown }).order_name;
    if (typeof requested !== "string" || !requested.trim()) return false;
    const target = normalizeOrderName(requested);
    return recentOrders.some(o => normalizeOrderName(o.name) === target);
  }
  // get_shopify_orders is a customer-wide fetch: if context already holds the
  // customer's orders, the redundant live lookup failing is noise.
  return true;
}

export function appendInitialPlanningWarnings(input: {
  ctx: AgentContext;
  operatorMode: boolean;
  warnings: string[];
}): void {
  const { ctx, operatorMode, warnings } = input;
  if (ctx.shopify && !ctx.thread.shopifyCustomerId && !operatorMode) {
    warnings.push("Couldn't find a Shopify customer - verify the correct account is linked before approving.");
  }
}

export async function executePlanningReadTools(input: {
  ctx: AgentContext;
  settings?: OrgSettings;
  readBlocks: Anthropic.ToolUseBlock[];
  skippedBlocks?: Anthropic.ToolUseBlock[];
}): Promise<PlanningReadToolResult> {
  const { ctx, settings, readBlocks, skippedBlocks = [] } = input;
  const readToolCalls: string[] = [];
  const readResultsMap = new Map<string, string>();
  const readStatusMap = new Map<string, ToolStatus>();

  applySkippedPlanningReadResults({
    skippedBlocks,
    ctx,
    readResultsMap,
    readStatusMap,
  });

  if (skippedBlocks.length > 0) {
    logger.info({
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      skippedReads: skippedBlocks.map((block) => block.name),
    }, "[agent:plan] skipped context-redundant read tools");
  }

  await Promise.all(
    readBlocks.map(async (b) => {
      readToolCalls.push(b.name);
      const toolStartedAt = Date.now();
      const inputKeys = b.input && typeof b.input === "object" ? Object.keys(b.input) : [];
      logger.info({
        orgId: ctx.orgId,
        threadId: ctx.thread.id,
        tool: b.name,
        inputKeys,
        inputChars: JSON.stringify(b.input ?? null).length,
      }, "[agent:plan] read tool call");
      let content: string;
      let status: ToolStatus;
      try {
        const executed = await executeToolStructured(b.name, b.input, ctx, settings);
        content = executed.message;
        status = executed.status;
      } catch {
        // A thrown lookup is treated as "nothing found" for warning purposes.
        content = "Lookup failed";
        status = "not_found";
      }
      logger.info({
        orgId: ctx.orgId,
        threadId: ctx.thread.id,
        tool: b.name,
        durationMs: Date.now() - toolStartedAt,
        resultChars: content.length,
      }, "[agent:plan] read tool result");
      readResultsMap.set(b.id, content);
      readStatusMap.set(b.id, status);
    })
  );

  return { readToolCalls, readResultsMap, readStatusMap };
}

export function appendPlanningReadWarnings(input: {
  warnings: string[];
  readBlocks: Anthropic.ToolUseBlock[];
  readResultsMap: Map<string, string>;
  readStatusMap: Map<string, ToolStatus>;
  recentOrders: ShopifyOrderSummary[];
}): void {
  const { warnings, readBlocks, readResultsMap, readStatusMap, recentOrders } = input;
  const readBlocksById = new Map(readBlocks.map((block) => [block.id, block]));
  let hasShopifyCustomerWarning = warnings.some(w => w.includes("Shopify customer"));
  for (const id of readResultsMap.keys()) {
    const block = readBlocksById.get(id);
    if (!block) continue;
    const isMissing = readStatusMap.get(id) === "not_found";
    if (isMissing) {
      if ((block.name === "get_shopify_customer" || block.name === "search_shopify_customers") && !hasShopifyCustomerWarning) {
        warnings.push("Couldn't find a Shopify customer - verify the correct account is linked before approving.");
        hasShopifyCustomerWarning = true;
      } else if (block.name === "get_shopify_orders" || block.name === "get_order_by_name") {
        if (!orderAlreadyInContext(block, recentOrders)) {
          warnings.push("No matching order found - confirm the order number with the customer before proceeding.");
        }
      } else if (block.name === "get_order_tracking") {
        warnings.push("No tracking information found - the order may not have been fulfilled yet.");
      } else if (block.name === "search_shopify_products") {
        warnings.push("No matching product found - the order edit step may need a corrected product name.");
      } else if (block.name === "search_kb") {
        warnings.push("No relevant KB articles found - the reply is based only on the conversation, not your documentation.");
      }
    }
  }
}
