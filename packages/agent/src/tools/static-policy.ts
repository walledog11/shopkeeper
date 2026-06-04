import type { OrgSettings } from "../types.js";
import { TOOL_CATEGORIES } from "./registry.js";
import type {
  CreateRefundInput,
  CreateShopifyOrderInput,
} from "./registry.js";

function cast<T>(v: unknown): T {
  return v as T;
}

export type StaticPolicyResult =
  | { blocked: false }
  | { blocked: true; reason: string };

// Synchronous, DB-free policy checks. This module is safe for Client Component
// imports; server-only tool execution lives in executor.ts.
export function checkStaticToolPolicy(
  name: string,
  args: unknown,
  settings: OrgSettings,
): StaticPolicyResult {
  const category = TOOL_CATEGORIES[name];
  if (category && !settings.toolsEnabled[category]) {
    return { blocked: true, reason: `${category} tools are disabled by the workspace owner.` };
  }

  if (name === "cancel_order" && settings.blockCancellations) {
    return { blocked: true, reason: "order cancellations are disabled by the workspace owner." };
  }

  if (name === "create_refund") {
    const input = cast<CreateRefundInput>(args);
    const hasPerCallCap = settings.maxRefundAmount !== null && settings.maxRefundAmount > 0;
    const hasDailyCap = settings.dailyRefundCap !== null && settings.dailyRefundCap > 0;

    if (hasPerCallCap || hasDailyCap) {
      if (!input.amount) {
        const limit = hasPerCallCap ? settings.maxRefundAmount : settings.dailyRefundCap;
        return { blocked: true, reason: `refund amount must be specified and cannot exceed $${limit}.` };
      }
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { blocked: true, reason: "refund amount must be a positive decimal value." };
      }
      if (hasPerCallCap && amount > (settings.maxRefundAmount as number)) {
        return { blocked: true, reason: `refund amount $${input.amount} exceeds the workspace limit of $${settings.maxRefundAmount}.` };
      }
    }
  }

  if (name === "create_shopify_order" && settings.blockCustomLineItems) {
    const input = cast<CreateShopifyOrderInput>(args);
    const hasCustomLineItem = Array.isArray(input.line_items) && input.line_items.some((item) => !item.variant_id);
    if (hasCustomLineItem) {
      return { blocked: true, reason: "custom line items are disabled by the workspace owner. Each line item must include a variant_id." };
    }
  }

  return { blocked: false };
}
