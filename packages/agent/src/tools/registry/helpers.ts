import type { BaseAgentContext, SupportContext } from "../../agent-context.js";
import type { ReturnWatchToolData } from "../../shopify/returns.js";
import logger from "../../logger.js";
import { toolError, type ToolResult } from "../result.js";
import type { AgentToolDefinition, ShopifyToolContext, ToolCapability, ToolExecutionDeps } from "./types.js";

export const noShopify = toolError("Error: no Shopify integration connected.");
export const noThread = toolError("Error: this tool requires a conversation thread.");
export const cancelReasons = ["customer", "fraud", "inventory", "declined", "other"] as const;
export const returnReasons = [
  "unwanted",
  "defective",
  "wrong_item",
  "not_as_described",
  "too_large",
  "too_small",
  "style",
  "color",
  "other",
] as const;
// Escalation is orthogonal (`Thread.escalatedAt`); `pending` remains a legacy
// database value but is no longer a state the model may create.
export const threadStatuses = ["open", "closed"] as const;

export function requireShopify(ctx: BaseAgentContext): ShopifyToolContext | null {
  return ctx.shopify;
}

export function threadContextOf(
  ctx: BaseAgentContext,
): { threadId: string; orgId: string; orgName: string } | null {
  const thread = (ctx as Partial<SupportContext>).thread;
  if (!thread) return null;
  return { threadId: thread.id, orgId: ctx.orgId, orgName: ctx.orgName };
}

// Which capabilities the given context provides. `shopify`/`thread-io` depend on
// injected sinks; `kb`/`stats` are org-scoped deps the shared executor always
// wires, so every context carries them.
export function contextCapabilities(ctx: BaseAgentContext): ReadonlySet<ToolCapability> {
  const capabilities = new Set<ToolCapability>(["kb", "stats"]);
  if (ctx.shopify) capabilities.add("shopify");
  if (ctx.io) capabilities.add("thread-io");
  return capabilities;
}

// The clean error a tool returns when the context is missing a capability it
// declares — the executor's module-boundary gate. Only `shopify`/`thread-io`
// can be absent, so those are the only messages surfaced.
export function unmetToolCapability(
  definition: AgentToolDefinition,
  ctx: BaseAgentContext,
): ToolResult | null {
  const provided = contextCapabilities(ctx);
  for (const capability of definition.capabilities) {
    if (!provided.has(capability)) {
      return capability === "shopify" ? noShopify : noThread;
    }
  }
  return null;
}

function readReturnWatchData(result: ToolResult): ReturnWatchToolData["returnWatch"] | null {
  if (result.status !== "ok" || !result.data || typeof result.data !== "object") return null;
  const payload = result.data as Partial<ReturnWatchToolData>;
  const watch = payload.returnWatch;
  if (!watch || typeof watch.shopifyReturnId !== "string" || typeof watch.orderId !== "string") {
    return null;
  }
  if (watch.tool !== "create_return" && watch.tool !== "create_exchange") return null;
  return watch;
}

export async function maybeRecordReturnWatch(
  ctx: BaseAgentContext,
  result: ToolResult,
  deps: Pick<ToolExecutionDeps, "recordReturnWatch">,
): Promise<void> {
  const watch = readReturnWatchData(result);
  if (!watch) return;

  const threadCtx = threadContextOf(ctx);
  try {
    await deps.recordReturnWatch({
      organizationId: threadCtx?.orgId ?? ctx.orgId,
      threadId: threadCtx?.threadId ?? null,
      orderId: watch.orderId,
      shopifyReturnId: watch.shopifyReturnId,
      returnName: watch.returnName,
      tool: watch.tool,
    });
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        organizationId: threadCtx?.orgId ?? ctx.orgId,
        orderId: watch.orderId,
        shopifyReturnId: watch.shopifyReturnId,
      },
      "[return-watch] failed to record return watch",
    );
  }
}
