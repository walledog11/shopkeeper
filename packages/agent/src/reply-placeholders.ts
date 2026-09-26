import type { ActionEntry } from "./agent-context.js";
import type { ReceiptSuccessV1 } from "./tools/result.js";
import type { RawToolCall, ReplyPlaceholderName, ResultBinding } from "./types.js";

/**
 * Receipt-bound placeholders in an exact draft (overhaul plan, decision A).
 *
 * The model writes the customer message before approval. A value that only
 * exists once the write has run — the amount Shopify actually refunded, the
 * return's name — is written as `{{refund_amount}}`, shown to the merchant as a
 * labeled placeholder, bound into the approval, and filled after execution from
 * the successful receipt of the one approved call it names. Nothing else in the
 * approved text changes.
 */

type ReceiptFor<TTool extends ReceiptSuccessV1["tool"]> = Extract<ReceiptSuccessV1, { tool: TTool }>;

interface PlaceholderSource<TTool extends ReceiptSuccessV1["tool"] = ReceiptSuccessV1["tool"]> {
  field: string;
  read: (receipt: ReceiptFor<TTool>) => string | null;
}

type PlaceholderSources = { [TTool in ReceiptSuccessV1["tool"]]?: PlaceholderSource<TTool> };

interface PlaceholderDefinition {
  /** What the merchant's card shows in its place. */
  label: string;
  /** What the model is told it holds. */
  describes: string;
  sources: PlaceholderSources;
}

/**
 * The customer-facing form of an exact amount. Money follows the same convention
 * as the merchant-facing copy in shopify/sales-pulse.ts — a symbol for USD, a
 * trailing ISO code otherwise; "USD 20.00" reads like a bank statement. The
 * amount is used as given, never re-rounded: not every currency has two decimal
 * places.
 */
export function customerMoney(amount: string, currency: string): string {
  const code = currency.trim().toUpperCase();
  return code === "USD" ? `$${amount}` : `${amount} ${code}`;
}

const refundAmount = (receipt: { facts: { amount: string; currency: string } }) => (
  customerMoney(receipt.facts.amount, receipt.facts.currency)
);

const PLACEHOLDERS: Record<ReplyPlaceholderName, PlaceholderDefinition> = {
  refund_amount: {
    label: "refund amount",
    describes: "the amount the refund actually returns",
    sources: {
      create_refund: { field: "facts.amount", read: refundAmount },
      create_partial_refund: { field: "facts.amount", read: refundAmount },
    },
  },
  return_name: {
    label: "return number",
    describes: "the name of the return that is created",
    sources: {
      create_return: { field: "facts.returnName", read: (receipt) => receipt.facts.returnName },
      create_exchange: { field: "facts.returnName", read: (receipt) => receipt.facts.returnName },
    },
  },
  order_name: {
    label: "order number",
    describes: "the name of the order that is created",
    sources: {
      create_shopify_order: { field: "facts.orderName", read: (receipt) => receipt.facts.orderName },
    },
  },
  gift_card_amount: {
    label: "gift card amount",
    describes: "the value of the gift card that is issued",
    sources: {
      create_gift_card: {
        field: "facts.amount",
        read: (receipt) => customerMoney(receipt.facts.amount, receipt.facts.currency),
      },
    },
  },
  tracking_number: {
    label: "tracking number",
    describes: "the tracking number recorded for the shipment",
    sources: {
      fulfill_order: { field: "facts.tracking.number", read: (receipt) => receipt.facts.tracking.number },
      attach_return_label: { field: "facts.trackingNumber", read: (receipt) => receipt.facts.trackingNumber },
    },
  },
};

// Any double-braced token counts, so an unknown name is refused rather than
// reaching the customer as literal braces.
const PLACEHOLDER_TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;

function isPlaceholderName(name: string): name is ReplyPlaceholderName {
  return Object.hasOwn(PLACEHOLDERS, name);
}

function tokenNames(draft: string): string[] {
  return [...new Set([...draft.matchAll(PLACEHOLDER_TOKEN)].map((match) => match[1]!))];
}

function sourceFor(placeholder: ReplyPlaceholderName, tool: string): PlaceholderSource | undefined {
  return (PLACEHOLDERS[placeholder].sources as Record<string, PlaceholderSource | undefined>)[tool];
}

/**
 * Binds each placeholder in the draft to the one approved call that can fill it.
 * `unbound` names every token that cannot be bound: an unknown name, or a name
 * with no approved call to fill it or more than one.
 */
export function bindReplyPlaceholders(
  draft: string,
  rawToolCalls: readonly RawToolCall[],
): { bindings: ResultBinding[]; unbound: string[] } {
  const bindings: ResultBinding[] = [];
  const unbound: string[] = [];
  for (const name of tokenNames(draft)) {
    if (!isPlaceholderName(name)) {
      unbound.push(name);
      continue;
    }
    const candidates = rawToolCalls.filter((call) => sourceFor(name, call.name));
    if (candidates.length !== 1) {
      unbound.push(name);
      continue;
    }
    const call = candidates[0]!;
    bindings.push({ placeholder: name, toolCallId: call.id, tool: call.name, field: sourceFor(name, call.name)!.field });
  }
  return { bindings, unbound };
}

/** True when the draft names any placeholder at all, bound or not. */
export function hasReplyPlaceholders(draft: string): boolean {
  return tokenNames(draft).length > 0;
}

export function isResultBinding(value: unknown): value is ResultBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as Record<string, unknown>;
  return Object.keys(binding).length === 4
    && typeof binding.placeholder === "string"
    && isPlaceholderName(binding.placeholder)
    && typeof binding.toolCallId === "string"
    && typeof binding.tool === "string"
    && sourceFor(binding.placeholder, binding.tool)?.field === binding.field;
}

/**
 * The draft as the merchant sees it before approval: each placeholder shown by
 * what it will hold, so the card never presents a token as finished text.
 */
export function displayApprovedDraft(draft: string): string {
  return draft.replace(PLACEHOLDER_TOKEN, (token, name: string) => (
    isPlaceholderName(name) ? `[${PLACEHOLDERS[name].label}]` : token
  ));
}

export type FilledDraft =
  | { status: "filled"; text: string }
  | { status: "unfilled"; placeholder: string };

/**
 * Fills the approved draft's placeholders from the receipts this execution
 * produced. Only a successful receipt of the exact bound call counts: a result
 * string is never parsed for a value, and a missing or empty field leaves the
 * draft unfilled — which means it is not sent.
 */
export function fillApprovedDraft(
  draft: string,
  bindings: readonly ResultBinding[],
  actionsPerformed: readonly ActionEntry[],
): FilledDraft {
  const values = new Map<string, string>();
  for (const binding of bindings) {
    const action = actionsPerformed.find((candidate) => (
      candidate.toolCallId === binding.toolCallId && candidate.tool === binding.tool
    ));
    const receipt = action?.status === "success" && action.receipt?.outcome === "succeeded"
      && action.receipt.tool === binding.tool
      ? action.receipt as ReceiptSuccessV1
      : null;
    const source = sourceFor(binding.placeholder, binding.tool);
    const value = receipt && source ? source.read(receipt as never) : null;
    if (!value?.trim()) return { status: "unfilled", placeholder: binding.placeholder };
    values.set(binding.placeholder, value);
  }
  for (const name of tokenNames(draft)) {
    if (!values.has(name)) return { status: "unfilled", placeholder: name };
  }
  return {
    status: "filled",
    text: draft.replace(PLACEHOLDER_TOKEN, (_token, name: string) => values.get(name)!),
  };
}

/**
 * The prompt section for a planner whose customer message is approved as an
 * exact draft. Generated from the same table the executor fills from, so the
 * model is only ever offered placeholders that can be filled.
 */
export function replyPlaceholderInstructions(): string {
  const lines = (Object.entries(PLACEHOLDERS) as [ReplyPlaceholderName, PlaceholderDefinition][])
    .map(([name, definition]) => (
      `- {{${name}}}: ${definition.describes} (${Object.keys(definition.sources).join(" or ")})`
    ));
  return `## Customer message approval
The merchant approves your customer message word for word, together with the actions, and it is sent only if every one of those actions succeeds. Write it as it should read once they have. A value that only exists after an action runs is written as a placeholder, filled from that action's result and nothing else:
${lines.join("\n")}
Use a placeholder only when the plan has exactly one action that fills it, and use no other double-brace names.`;
}
