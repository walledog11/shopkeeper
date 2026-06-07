import type { BaseAgentContext, SupportContext } from "../../agent-context.js";
import { toolError } from "../result.js";
import type { ShopifyToolContext } from "./types.js";

export const noShopify = toolError("Error: no Shopify integration connected.");
export const noThread = toolError("Error: this tool requires a conversation thread.");
export const cancelReasons = ["customer", "fraud", "inventory", "declined", "other"] as const;
export const threadStatuses = ["open", "pending", "closed"] as const;

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
