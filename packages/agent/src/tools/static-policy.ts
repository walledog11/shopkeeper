import type { AgentAuthState, VerifiedOrderRef } from "../agent-context.js";
import {
  guestToolBlockReason,
  isGuestAllowedTool,
  isOrderScopedTool,
  isVerifiedAllowedTool,
  orderScopeBlockReason,
  verifiedToolBlockReason,
} from "../guest-policy.js";
// Deliberately order-reference's normalizer, not storefront-verification's:
// this module reaches the client bundle through plan-preview, and
// storefront-verification imports node:crypto. Both sides of the comparison go
// through this one function, so consistency is what matters, not which.
import { normalizeOrderName } from "../order-reference.js";
import type { OrgSettings } from "../types.js";
import type {
  AgentToolDefinition,
  CreateRefundInput,
  CreateShopifyOrderInput,
  GetOrderByNameInput,
  GetOrderTrackingInput,
} from "./registry/index.js";
import { formatToolInputValidationError, getToolDefinition } from "./registry/index.js";

export type StaticPolicyResult =
  | { blocked: false }
  | { blocked: true; reason: string };

export interface StaticPolicyOptions {
  authState?: AgentAuthState;
  verifiedOrders?: VerifiedOrderRef[];
}

// The allowlist half of storefront enforcement: which tools this auth state may
// name at all. Independent of arguments, so it runs both before and after
// parsing — a shopper must not learn that a tool exists from a validation error.
function checkStorefrontToolAllowed(
  name: string,
  options: StaticPolicyOptions | undefined,
): StaticPolicyResult | null {
  if (options?.authState === "guest" && !isGuestAllowedTool(name)) {
    return { blocked: true, reason: guestToolBlockReason(name) };
  }
  if (options?.authState === "verified" && !isVerifiedAllowedTool(name)) {
    return { blocked: true, reason: verifiedToolBlockReason(name) };
  }
  return null;
}

// The scope half, which needs parsed arguments: a verified session may read the
// orders it proved control of and no others. Without this, verifying #1025
// would hand over every order in the shop by number — a strictly worse
// disclosure than the guest policy it replaces.
function checkVerifiedOrderScope(
  definition: AgentToolDefinition,
  input: unknown,
  options: StaticPolicyOptions | undefined,
): StaticPolicyResult | null {
  if (options?.authState !== "verified") return null;
  if (!isOrderScopedTool(definition.name)) return null;

  const verified = options.verifiedOrders ?? [];
  if (verified.length === 0) {
    return { blocked: true, reason: orderScopeBlockReason(definition.name) };
  }

  if (definition.name === "get_order_by_name") {
    const requested = normalizeOrderName((input as GetOrderByNameInput).order_name ?? "");
    const allowed = verified.some((o) => normalizeOrderName(o.orderName) === requested);
    return allowed ? null : { blocked: true, reason: orderScopeBlockReason(definition.name) };
  }

  if (definition.name === "get_order_tracking") {
    const requested = String((input as GetOrderTrackingInput).order_id ?? "").trim();
    const allowed = verified.some((o) => o.orderId === requested);
    return allowed ? null : { blocked: true, reason: orderScopeBlockReason(definition.name) };
  }

  // An order-scoped tool with no scope rule written for it is refused rather
  // than allowed: adding one to VERIFIED_ORDER_TOOL_NAMES must not silently
  // grant unscoped access.
  return { blocked: true, reason: orderScopeBlockReason(definition.name) };
}

export function checkParsedStaticToolPolicy(
  definition: AgentToolDefinition,
  input: unknown,
  settings: OrgSettings,
  options?: StaticPolicyOptions,
): StaticPolicyResult {
  // First, and independent of settings: no workspace configuration can widen
  // what a storefront visitor reaches. Tool selection already omits these, so
  // arriving here means a plan named a tool the storefront set never offered.
  const storefrontBlock = checkStorefrontToolAllowed(definition.name, options);
  if (storefrontBlock) return storefrontBlock;

  const scopeBlock = checkVerifiedOrderScope(definition, input, options);
  if (scopeBlock) return scopeBlock;

  if (definition.availability === "retired") {
    return {
      blocked: true,
      reason: `${definition.name} is retired and cannot create a new provider action. Escalate this request to the merchant.`,
    };
  }

  if (definition.policy.categoryPermission && !settings.toolsEnabled[definition.category]) {
    return { blocked: true, reason: `${definition.category} tools are disabled by the workspace owner.` };
  }

  if (definition.policy.cancellationDisabled && settings.blockCancellations) {
    return { blocked: true, reason: "order cancellations are disabled by the workspace owner." };
  }

  if (definition.policy.refundAmountLimits) {
    const refundInput = input as CreateRefundInput;
    const noun = definition.name === "create_refund" ? "refund" : "gift card";
    const hasPerCallCap = settings.maxRefundAmount !== null && settings.maxRefundAmount > 0;
    const hasDailyCap = settings.dailyRefundCap !== null && settings.dailyRefundCap > 0;

    if (hasPerCallCap || hasDailyCap) {
      if (!refundInput.amount) {
        const limit = hasPerCallCap ? settings.maxRefundAmount : settings.dailyRefundCap;
        return { blocked: true, reason: `${noun} amount must be specified and cannot exceed $${limit}.` };
      }
      const amount = Number(refundInput.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { blocked: true, reason: `${noun} amount must be a positive decimal value.` };
      }
      if (hasPerCallCap && amount > (settings.maxRefundAmount as number)) {
        return { blocked: true, reason: `${noun} amount $${refundInput.amount} exceeds the workspace limit of $${settings.maxRefundAmount}.` };
      }
    }
  }

  if (definition.policy.customLineItemsDisabled && settings.blockCustomLineItems) {
    const orderInput = input as CreateShopifyOrderInput;
    const hasCustomLineItem = orderInput.line_items.some((item) => !item.variant_id);
    if (hasCustomLineItem) {
      return { blocked: true, reason: "custom line items are disabled by the workspace owner. Each line item must include a variant_id." };
    }
  }

  return { blocked: false };
}

// Synchronous, DB-free policy checks. This module is safe for Client Component
// imports; server-only tool execution lives in executor.ts.
export function checkStaticToolPolicy(
  name: string,
  args: unknown,
  settings: OrgSettings,
  options?: StaticPolicyOptions,
): StaticPolicyResult {
  const definition = getToolDefinition(name);
  if (!definition) return { blocked: false };

  // Ahead of parsing: whether a storefront visitor may call a tool at all does
  // not depend on whether the arguments are well-formed, and reporting a
  // validation error for a tool they can never call would be a misleading
  // answer to the real question.
  const storefrontBlock = checkStorefrontToolAllowed(definition.name, options);
  if (storefrontBlock) return storefrontBlock;

  let input: unknown;
  try {
    input = definition.parse(args);
  } catch (error) {
    return { blocked: true, reason: formatToolInputValidationError(name, error) };
  }

  return checkParsedStaticToolPolicy(definition, input, settings, options);
}
