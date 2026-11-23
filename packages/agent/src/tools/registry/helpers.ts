import type { BaseAgentContext, SupportContext } from "../../agent-context.js";
import { toolError, toolPolicyBlock, type ToolResult } from "../result.js";
import { unmetScopes } from "../../shopify/integration-health.js";
import type { AgentToolDefinition, ShopifyToolContext, ToolCapability } from "./types.js";

export const noShopify = toolError("Error: no Shopify integration connected.");
export const noThread = toolError("Error: this tool requires a conversation thread.");

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
//
// The scope check lives here too, because "may this tool run in this context"
// is one question. The planner also filters short-granted tools out of the
// model's list, so a merchant on an older grant is never shown a plan step that
// would be refused; this is the backstop for a stale approved plan or a direct
// call, and it names the scope rather than letting Shopify return a 403 the
// merchant cannot act on.
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
  if (ctx.shopify && definition.requiredScopes.length > 0) {
    const unmet = unmetScopes(ctx.shopify.grantedScopes, definition.requiredScopes);
    if (unmet.length > 0) {
      return toolPolicyBlock(
        `Error: this store's Shopify connection does not grant ${unmet.join(", ")}. `
        + "Reconnect Shopify from Settings to enable this action.",
      );
    }
  }
  return null;
}
