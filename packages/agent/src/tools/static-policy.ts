import type { AgentAuthState } from "../agent-context.js";
import { guestToolBlockReason, isGuestAllowedTool } from "../guest-policy.js";
import type { OrgSettings } from "../types.js";
import type {
  AgentToolDefinition,
  CreateRefundInput,
  CreateShopifyOrderInput,
} from "./registry/index.js";
import { formatToolInputValidationError, getToolDefinition } from "./registry/index.js";

export type StaticPolicyResult =
  | { blocked: false }
  | { blocked: true; reason: string };

export interface StaticPolicyOptions {
  authState?: AgentAuthState;
}

export function checkParsedStaticToolPolicy(
  definition: AgentToolDefinition,
  input: unknown,
  settings: OrgSettings,
  options?: StaticPolicyOptions,
): StaticPolicyResult {
  // First, and independent of settings: no workspace configuration can widen
  // what an anonymous visitor reaches. Tool selection already omits these, so
  // arriving here means a plan named a tool the guest set never offered.
  if (options?.authState === "guest" && !isGuestAllowedTool(definition.name)) {
    return { blocked: true, reason: guestToolBlockReason(definition.name) };
  }

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

  // Ahead of parsing: whether a guest may call a tool at all does not depend on
  // whether the arguments are well-formed, and reporting a validation error for
  // a tool they can never call would be a misleading answer to the real
  // question.
  if (options?.authState === "guest" && !isGuestAllowedTool(definition.name)) {
    return { blocked: true, reason: guestToolBlockReason(definition.name) };
  }

  let input: unknown;
  try {
    input = definition.parse(args);
  } catch (error) {
    return { blocked: true, reason: formatToolInputValidationError(name, error) };
  }

  return checkParsedStaticToolPolicy(definition, input, settings, options);
}
