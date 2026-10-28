import type {
  AgentActionStatus,
  BaseAgentContext,
  SupportContext,
} from "./agent-context.js";
import type { ReceiptV1 } from "./tools/result.js";
import type { RawToolCall } from "./types.js";

export type CompletionAction =
  | "address_update"
  | "cancellation"
  | "customer_note"
  | "customer_update"
  | "discount"
  | "exchange"
  | "fulfillment"
  | "order_creation"
  | "order_update"
  | "price_update"
  | "refund"
  | "return"
  | "store_credit";

export type CompletionFactOutcome =
  | "proposed"
  | AgentActionStatus
  | Exclude<ReceiptV1["outcome"], "succeeded">;

interface CompletionFactTarget {
  kind: "customer" | "email" | "order";
  id: string;
  aliases?: string[];
}

/**
 * A mutation claim may be rendered only from one of these facts. Proposed facts
 * make a reviewed conditional reply approvable; only a successful execution or
 * live provider read can make that reply sendable.
 */
export interface CompletionFact {
  action: CompletionAction;
  target?: CompletionFactTarget;
  amount?: string;
  currency?: string;
  outcome: CompletionFactOutcome;
  executionReference: string;
  sourceTool: string;
}

type FactContext = Pick<BaseAgentContext, "shopify"> & Partial<Pick<SupportContext, "customer" | "recentOrders" | "thread">>;

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function canonicalAmount(value: string | undefined): string | undefined {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return undefined;
  const [whole, fraction = ""] = value.trim().split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}

function orderTarget(
  orderId: string,
  ctx?: FactContext,
  orderNames?: ReadonlyMap<string, string>,
): CompletionFactTarget {
  const name = ctx?.recentOrders?.find((candidate) => candidate.id === orderId)?.name
    ?? orderNames?.get(orderId);
  return {
    kind: "order",
    id: orderId,
    ...(name && name !== orderId ? { aliases: [name] } : {}),
  };
}

function orderCurrency(orderId: string, ctx?: FactContext): string | undefined {
  return ctx?.recentOrders
    ?.find((candidate) => candidate.id === orderId)
    ?.currency?.trim().toUpperCase() || undefined;
}

function fact(
  action: CompletionAction,
  sourceTool: string,
  outcome: CompletionFactOutcome,
  executionReference: string,
  options: Pick<CompletionFact, "amount" | "currency" | "target"> = {},
): CompletionFact {
  return { action, sourceTool, outcome, executionReference, ...options };
}

function mutationFacts(input: {
  tool: string;
  rawInput: unknown;
  outcome: CompletionFactOutcome;
  executionReference: string;
  ctx?: FactContext;
  orderNames?: ReadonlyMap<string, string>;
}): CompletionFact[] {
  const parsed = record(input.rawInput);
  if (!parsed) return [];
  const orderId = textField(parsed, "order_id");
  const customerId = textField(parsed, "customer_id");
  const amountFromInput = canonicalAmount(textField(parsed, "amount"));
  const currencyFromInput = textField(parsed, "currency")?.toUpperCase();
  const orderOptions = orderId
    ? {
        target: orderTarget(orderId, input.ctx, input.orderNames),
        ...(currencyFromInput || orderCurrency(orderId, input.ctx)
          ? { currency: currencyFromInput ?? orderCurrency(orderId, input.ctx) }
          : {}),
      }
    : {};
  const customerOptions = customerId
    ? { target: { kind: "customer" as const, id: customerId } }
    : {};
  const base = {
    sourceTool: input.tool,
    outcome: input.outcome,
    executionReference: input.executionReference,
  };

  switch (input.tool) {
    case "create_refund":
      return orderId ? [{ ...base, action: "refund", ...orderOptions, ...(amountFromInput ? { amount: amountFromInput } : {}) }] : [];
    case "create_partial_refund": {
      if (!orderId) return [];
      return [{ ...base, action: "refund", ...orderOptions }];
    }
    case "cancel_order": {
      if (!orderId) return [];
      const facts = [fact("cancellation", input.tool, input.outcome, input.executionReference, orderOptions)];
      const mayRefund = input.outcome === "proposed";
      if (mayRefund) facts.push(fact("refund", input.tool, input.outcome, input.executionReference, orderOptions));
      return facts;
    }
    case "create_return":
    case "attach_return_label":
      return orderId ? [fact("return", input.tool, input.outcome, input.executionReference, orderOptions)] : [];
    case "create_exchange":
      return orderId
        ? [
            fact("exchange", input.tool, input.outcome, input.executionReference, orderOptions),
            fact("return", input.tool, input.outcome, input.executionReference, orderOptions),
          ]
        : [];
    case "create_gift_card":
    case "issue_store_credit":
      return customerId
        ? [fact("store_credit", input.tool, input.outcome, input.executionReference, {
            ...customerOptions,
            ...(amountFromInput ? { amount: amountFromInput } : {}),
            ...(currencyFromInput ? { currency: currencyFromInput } : {}),
          })]
        : [];
    case "update_shopify_order_address":
      return orderId ? [fact("address_update", input.tool, input.outcome, input.executionReference, orderOptions)] : [];
    case "update_shopify_customer_info":
      return customerId ? [fact("customer_update", input.tool, input.outcome, input.executionReference, customerOptions)] : [];
    case "add_shopify_customer_note":
      return customerId ? [fact("customer_note", input.tool, input.outcome, input.executionReference, customerOptions)] : [];
    case "fulfill_order":
      return orderId ? [fact("fulfillment", input.tool, input.outcome, input.executionReference, orderOptions)] : [];
    case "create_shopify_order": {
      const email = textField(parsed, "email")?.toLowerCase();
      return email
        ? [fact("order_creation", input.tool, input.outcome, input.executionReference, { target: { kind: "email", id: email } })]
        : [];
    }
    case "edit_shopify_order":
      return orderId ? [fact("order_update", input.tool, input.outcome, input.executionReference, orderOptions)] : [];
    case "create_flash_sale":
    case "end_flash_sale":
    case "issue_discount":
      return [fact("discount", input.tool, input.outcome, input.executionReference)];
    case "set_variant_prices":
      return [fact("price_update", input.tool, input.outcome, input.executionReference)];
    default:
      return [];
  }
}

/**
 * Order names read on this turn, keyed by order id.
 *
 * `ctx.recentOrders` only holds the orders of a *resolved* Shopify customer, so
 * a turn acting for an unidentified shopper — every social DM until identity
 * linking exists — has the order's name in its own `get_order_by_name` result
 * and nowhere else. Without it the refund fact carries a bare numeric id, the
 * reply names the order the way the customer does, and a supported claim reads
 * as ungrounded. Proposal and execution both need this, so they share it.
 */
function collectOrderNames(
  entries: readonly { tool: string; raw: string | undefined }[],
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const { tool, raw } of entries) {
    if (tool !== "get_order_by_name" && tool !== "get_shopify_orders") continue;
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const candidate of Array.isArray(parsed) ? parsed : [parsed]) {
      const order = record(candidate);
      if (!order) continue;
      const id = textField(order, "id");
      const name = textField(order, "name");
      if (id && name) names.set(id, name);
    }
  }
  return names;
}

export function proposedCompletionFacts(
  calls: readonly RawToolCall[],
  ctx?: FactContext,
  readResults?: Readonly<Record<string, string>>,
): CompletionFact[] {
  const orderNames = collectOrderNames(
    calls.map((call) => ({ tool: call.name, raw: readResults?.[call.id] })),
  );
  return calls.flatMap((call) => mutationFacts({
    tool: call.name,
    rawInput: call.input,
    outcome: "proposed",
    executionReference: call.id,
    ctx,
    orderNames,
  }));
}

function historicalOrderFacts(
  value: unknown,
  sourceTool: string,
  executionReference: string,
): CompletionFact[] {
  const parsed = Array.isArray(value) ? value : [value];
  return parsed.flatMap((candidate) => {
    const order = record(candidate);
    if (!order) return [];
    const id = textField(order, "id");
    const name = textField(order, "name");
    if (!id && !name) return [];
    const target: CompletionFactTarget = {
      kind: "order",
      id: id ?? name!,
      ...(name && name !== id ? { aliases: [name] } : {}),
    };
    const currency = textField(order, "currency")?.toUpperCase();
    const common = { target, ...(currency ? { currency } : {}) };
    const facts: CompletionFact[] = [];
    if (textField(order, "financial_status")?.toLowerCase() === "refunded") {
      const amount = canonicalAmount(textField(order, "total_price"));
      facts.push(fact("refund", sourceTool, "success", executionReference, {
        ...common,
        ...(amount ? { amount } : {}),
      }));
    }
    if (textField(order, "fulfillment_status")?.toLowerCase() === "fulfilled") {
      facts.push(fact("fulfillment", sourceTool, "success", executionReference, common));
    }
    return facts;
  });
}

export function historicalCompletionFacts(
  calls: readonly RawToolCall[],
  readResults: Readonly<Record<string, string>> | undefined,
): CompletionFact[] {
  if (!readResults) return [];
  return calls.flatMap((call) => {
    if (call.name !== "get_order_by_name" && call.name !== "get_shopify_orders") return [];
    const raw = readResults[call.id];
    if (!raw) return [];
    try {
      return historicalOrderFacts(JSON.parse(raw), call.name, `read:${call.id}`);
    } catch {
      return [];
    }
  });
}

export function expectedCustomerRecipient(ctx: FactContext | undefined): string | undefined {
  const platformId = ctx?.customer?.platformId.trim().toLowerCase();
  return platformId?.includes("@") ? platformId : undefined;
}

export function factTargetsCurrentCustomer(fact: CompletionFact, ctx: FactContext | undefined): boolean {
  if (fact.target?.kind !== "customer") return true;
  const linkedId = ctx?.thread?.shopifyCustomerId;
  return !linkedId || linkedId === fact.target.id;
}
