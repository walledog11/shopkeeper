import type { ActionEntry } from "./agent-context.js";
import type { ReceiptSuccessV1 } from "./tools/result.js";
import type {
  MerchantAnswerBinding,
  MerchantAnswerName,
  MerchantAnswers,
  RawToolCall,
  ReceiptResultBinding,
  ReplyPlaceholderName,
  ResultBinding,
} from "./types.js";
import { formatMoney } from "./money.js";

/**
 * Receipt-bound placeholders in an exact draft (overhaul plan, decision A).
 *
 * The model writes the customer message before approval. A value that only
 * exists once the write has run — the amount Shopify actually refunded, a
 * tracking number — is written as `{{refund_amount}}`, shown to the merchant as a
 * labeled placeholder, bound into the approval, and filled after execution from
 * the successful receipt of the one approved call it names. Nothing else in the
 * approved text changes.
 *
 * A store fact only the merchant knows — how long refunds take — is a blank:
 * `{{refund_timing}}`. Once the store has answered it, planning fills it from the
 * saved answer (bound on the reply call, so the card shows it and the approval
 * binds it). Until then the card asks the question, and the merchant's answer is
 * their approval. Either way the customer receives the approved words with the
 * merchant's own words in the blank.
 */

type ReceiptFor<TTool extends ReceiptSuccessV1["tool"]> = Extract<ReceiptSuccessV1, { tool: TTool }>;

interface PlaceholderSource<TTool extends ReceiptSuccessV1["tool"] = ReceiptSuccessV1["tool"]> {
  field: string;
  read: (receipt: ReceiptFor<TTool>) => string | null;
  /**
   * The value the approval already binds, for a call whose execution refuses to
   * produce any other (a refund whose Shopify amount moved is `amount_mismatch`).
   * The card shows it in the slot; the customer still gets the receipt's value,
   * which this guarantees is the same.
   */
  quote?: (input: Record<string, unknown>) => string | null;
}

type PlaceholderSources = { [TTool in ReceiptSuccessV1["tool"]]?: PlaceholderSource<TTool> };

interface PlaceholderDefinition {
  /** What the merchant's card shows in its place. */
  label: string;
  /** What the model is told it holds. */
  describes: string;
  /**
   * False for a value only the merchant can use. A customer message is never
   * offered it and cannot bind it; the merchant still sees it in the receipt.
   */
  customerFacing: boolean;
  sources: PlaceholderSources;
}

const refundAmount = (receipt: { facts: { amount: string; currency: string } }) => (
  formatMoney(receipt.facts.amount, receipt.facts.currency, { exact: true })
);

const quotedMoney = (amount: unknown, currency: unknown) => (
  typeof amount === "string" && amount.trim()
    ? formatMoney(amount, typeof currency === "string" ? currency : null, { exact: true })
    : null
);

const PLACEHOLDERS: Record<ReplyPlaceholderName, PlaceholderDefinition> = {
  refund_amount: {
    label: "refund amount",
    describes: "the amount the refund actually returns",
    customerFacing: true,
    sources: {
      create_refund: {
        field: "facts.amount",
        read: refundAmount,
        quote: (input) => quotedMoney(input.amount, input.currency),
      },
      create_partial_refund: {
        field: "facts.amount",
        read: refundAmount,
        quote: (input) => quotedMoney(input.approval_amount, input.approval_currency),
      },
      cancel_order: {
        field: "facts.refund.amount",
        read: (receipt) => (receipt.facts.refund ? refundAmount({ facts: receipt.facts.refund }) : null),
      },
    },
  },
  return_name: {
    label: "return number",
    describes: "the name of the return that is created",
    customerFacing: false,
    sources: {
      create_return: { field: "facts.returnName", read: (receipt) => receipt.facts.returnName },
      create_exchange: { field: "facts.returnName", read: (receipt) => receipt.facts.returnName },
    },
  },
  order_name: {
    label: "order number",
    describes: "the name of the order that is created",
    customerFacing: true,
    sources: {
      create_shopify_order: { field: "facts.orderName", read: (receipt) => receipt.facts.orderName },
    },
  },
  gift_card_amount: {
    label: "gift card amount",
    describes: "the value of the gift card that is issued",
    customerFacing: true,
    sources: {
      create_gift_card: {
        field: "facts.amount",
        read: (receipt) => formatMoney(receipt.facts.amount, receipt.facts.currency, { exact: true }),
      },
    },
  },
  tracking_number: {
    label: "tracking number",
    describes: "the tracking number recorded for the shipment",
    customerFacing: true,
    sources: {
      fulfill_order: { field: "facts.tracking.number", read: (receipt) => receipt.facts.tracking.number },
      attach_return_label: { field: "facts.trackingNumber", read: (receipt) => receipt.facts.trackingNumber },
    },
  },
};

interface MerchantAnswerDefinition {
  /** What the card and the dashboard show in its place. */
  label: string;
  /** The question the card asks; also the question the answer is saved under. */
  question: string;
  /** What the model is told it holds, and when to use it. */
  describes: string;
  /** An example answer, shown where the merchant types it. */
  example: string;
}

const MERCHANT_ANSWERS: Record<MerchantAnswerName, MerchantAnswerDefinition> = {
  refund_timing: {
    label: "refund timing",
    question: "How long do refunds take to reach your customers?",
    describes: "how long the refund takes to reach the customer, filled from the store's saved answer or by the merchant as they approve; written into a sentence such as \"It should reach you within {{refund_timing}}.\"",
    example: "5-10 business days",
  },
};

/** Longest blank answer accepted: a phrase, not a message. */
export const MERCHANT_ANSWER_MAX_LENGTH = 120;

export const MERCHANT_ANSWER_NAMES = Object.keys(MERCHANT_ANSWERS) as MerchantAnswerName[];

/** The question a blank asks, which its saved answer is filed under. */
export function merchantAnswerQuestion(name: MerchantAnswerName): string {
  return MERCHANT_ANSWERS[name].question;
}

/**
 * The reply call's runtime-only input that carries a blank's saved answer from
 * planning to approval. Never offered to the model.
 */
export function blankAnswerField(name: MerchantAnswerName): string {
  return `approval_${name}`;
}

/** An answer that can go in front of a customer as written: one short line. */
export function readBlankAnswer(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > MERCHANT_ANSWER_MAX_LENGTH || /[\r\n]|\{\{|\}\}/.test(text)) return null;
  return text;
}

// Any double-braced token counts, so an unknown name is refused rather than
// reaching the customer as literal braces.
const PLACEHOLDER_TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;

function isPlaceholderName(name: string): name is ReplyPlaceholderName {
  return Object.hasOwn(PLACEHOLDERS, name);
}

function isMerchantAnswerName(name: string): name is MerchantAnswerName {
  return Object.hasOwn(MERCHANT_ANSWERS, name);
}

function isMerchantAnswerBinding(binding: ResultBinding): binding is MerchantAnswerBinding {
  return "source" in binding;
}

function customerDraftOf(call: { name: string; input?: unknown }): string | null {
  const input = call.input && typeof call.input === "object" ? call.input as Record<string, unknown> : null;
  const draft = call.name === "send_reply" ? input?.text : call.name === "send_email" ? input?.body : null;
  return typeof draft === "string" ? draft : null;
}

/** The saved answers planning bound on the plan's customer message call. */
export function blankAnswersInCalls(rawToolCalls: readonly { name: string; input?: unknown }[]): MerchantAnswers {
  const answers: MerchantAnswers = {};
  for (const call of rawToolCalls) {
    if (customerDraftOf(call) === null) continue;
    const input = call.input as Record<string, unknown>;
    for (const name of MERCHANT_ANSWER_NAMES) {
      const answer = readBlankAnswer(input[blankAnswerField(name)]);
      if (answer) answers[name] = answer;
    }
  }
  return answers;
}

/**
 * The call with the store's saved answers bound for its draft's blanks, and no
 * other blank answer: one the model wrote itself is dropped, so only a saved
 * answer ever fills a blank before the merchant approves.
 */
export function withStoreAnswers<T extends { name: string; input?: unknown }>(call: T, saved: MerchantAnswers): T {
  const draft = customerDraftOf(call);
  if (draft === null) return call;
  const input = { ...(call.input as Record<string, unknown>) };
  for (const name of MERCHANT_ANSWER_NAMES) delete input[blankAnswerField(name)];
  for (const name of tokenNames(draft)) {
    if (!isMerchantAnswerName(name)) continue;
    const answer = readBlankAnswer(saved[name]);
    if (answer) input[blankAnswerField(name)] = answer;
  }
  return { ...call, input };
}

function tokenNames(draft: string): string[] {
  return [...new Set([...draft.matchAll(PLACEHOLDER_TOKEN)].map((match) => match[1]!))];
}

function sourceFor(placeholder: ReplyPlaceholderName, tool: string): PlaceholderSource | undefined {
  return (PLACEHOLDERS[placeholder].sources as Record<string, PlaceholderSource | undefined>)[tool];
}

/**
 * Binds each placeholder in the draft to the one approved call that can fill it.
 * `unbound` names every token that cannot be bound: an unknown or merchant-only
 * name, or a name with no approved call to fill it or more than one.
 */
export function bindReplyPlaceholders(
  draft: string,
  rawToolCalls: readonly RawToolCall[],
): { bindings: ResultBinding[]; unbound: string[] } {
  const bindings: ResultBinding[] = [];
  const unbound: string[] = [];
  const saved = blankAnswersInCalls(rawToolCalls);
  for (const name of tokenNames(draft)) {
    if (isMerchantAnswerName(name)) {
      const answer = saved[name];
      bindings.push({ placeholder: name, source: "merchant", ...(answer ? { answer } : {}) });
      continue;
    }
    if (!isPlaceholderName(name) || !PLACEHOLDERS[name].customerFacing) {
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
  if (binding.source === "merchant") {
    const keys = Object.keys(binding).length;
    return typeof binding.placeholder === "string"
      && isMerchantAnswerName(binding.placeholder)
      && (keys === 2 || (keys === 3 && readBlankAnswer(binding.answer) === binding.answer));
  }
  return Object.keys(binding).length === 4
    && typeof binding.placeholder === "string"
    && isPlaceholderName(binding.placeholder)
    && typeof binding.toolCallId === "string"
    && typeof binding.tool === "string"
    && sourceFor(binding.placeholder, binding.tool)?.field === binding.field;
}

/**
 * The draft as the merchant sees it before approval: each placeholder shown by
 * what it will hold, so the card never presents a token as finished text. Given
 * the bindings and calls, a slot whose call binds its value already (a refund's
 * Shopify quote) shows that value instead of its label.
 */
export function displayApprovedDraft(
  draft: string,
  bound?: {
    bindings: readonly ResultBinding[];
    rawToolCalls: readonly { id?: string; name: string; input?: unknown }[];
  },
): string {
  const saved = bound ? blankAnswersInCalls(bound.rawToolCalls) : {};
  return draft.replace(PLACEHOLDER_TOKEN, (token, name: string) => {
    if (isMerchantAnswerName(name)) {
      const filled = bound?.bindings.find((candidate): candidate is MerchantAnswerBinding => (
        candidate.placeholder === name && isMerchantAnswerBinding(candidate)
      ))?.answer ?? saved[name];
      return filled ?? `[${MERCHANT_ANSWERS[name].label}]`;
    }
    if (!isPlaceholderName(name)) return token;
    const binding = bound?.bindings.find((candidate): candidate is ReceiptResultBinding => (
      candidate.placeholder === name && !isMerchantAnswerBinding(candidate)
    ));
    const call = binding && bound?.rawToolCalls.find((candidate) => (
      candidate.id === binding.toolCallId && candidate.name === binding.tool
    ));
    const input = call?.input && typeof call.input === "object" ? call.input as Record<string, unknown> : null;
    const quoted = binding && input ? sourceFor(name, binding.tool)?.quote?.(input) : null;
    return quoted ?? `[${PLACEHOLDERS[name].label}]`;
  });
}

/**
 * What a successful receipt can show the merchant: every value a placeholder
 * could take from it, under the label the approval card gives that placeholder.
 * Empty for a receipt no placeholder reads.
 */
export function receiptPlaceholderValues(
  receipt: ReceiptSuccessV1,
): { label: string; value: string }[] {
  const shown: { label: string; value: string }[] = [];
  for (const definition of Object.values(PLACEHOLDERS)) {
    const source = (definition.sources as Record<string, PlaceholderSource | undefined>)[receipt.tool];
    const value = source?.read(receipt as never);
    if (value?.trim()) shown.push({ label: definition.label, value });
  }
  return shown;
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
  merchantAnswers: MerchantAnswers = {},
): FilledDraft {
  const values = new Map<string, string>();
  for (const binding of bindings) {
    if (isMerchantAnswerBinding(binding)) {
      const answer = (binding.answer ?? merchantAnswers[binding.placeholder])?.trim();
      if (!answer) return { status: "unfilled", placeholder: binding.placeholder };
      values.set(binding.placeholder, answer);
      continue;
    }
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
    .filter(([, definition]) => definition.customerFacing)
    .map(([name, definition]) => (
      `- {{${name}}}: ${definition.describes} (${Object.keys(definition.sources).join(" or ")})`
    ));
  const blanks = (Object.entries(MERCHANT_ANSWERS) as [MerchantAnswerName, MerchantAnswerDefinition][])
    .map(([name, definition]) => `- {{${name}}}: ${definition.describes}`);
  return `## Customer message approval
The merchant approves your customer message word for word, together with the actions, and it is sent only if every one of those actions succeeds. Write it as it should read once they have. A value that only exists after an action runs is written as a placeholder, filled from that action's result and nothing else:
${lines.join("\n")}
Use a placeholder only when the plan has exactly one action that fills it.
A store fact only the merchant knows is left as a blank they fill in when they approve, so you can still propose the whole plan instead of asking first:
${blanks.join("\n")}
Use no other double-brace names.`;
}

/** A blank the merchant fills as they approve, with what to show and ask. */
export interface MerchantAnswerSlot {
  name: MerchantAnswerName;
  label: string;
  question: string;
  example: string;
}

/** The blanks an approved message leaves for the merchant to answer, in draft order. */
export function merchantAnswerSlots(bindings: readonly ResultBinding[] | null | undefined): MerchantAnswerSlot[] {
  return (bindings ?? [])
    .filter(isMerchantAnswerBinding)
    .filter((binding) => !binding.answer)
    .map((binding) => {
      const { label, question, example } = MERCHANT_ANSWERS[binding.placeholder];
      return { name: binding.placeholder, label, question, example };
    });
}

/**
 * Reads blank answers from a request body. Null when the value is not an object
 * of known blanks to single-line phrases; an answer that cannot be put in front
 * of a customer is refused, never trimmed down to one that can.
 */
export function parseMerchantAnswers(value: unknown): MerchantAnswers | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const answers: MerchantAnswers = {};
  for (const [name, answer] of Object.entries(value as Record<string, unknown>)) {
    const text = isMerchantAnswerName(name) ? readBlankAnswer(answer) : null;
    if (!text) return null;
    answers[name as MerchantAnswerName] = text;
  }
  return answers;
}

/** The blanks among `slots` that `answers` leaves empty. */
export function missingMerchantAnswers(
  slots: readonly MerchantAnswerSlot[],
  answers: MerchantAnswers | undefined,
): MerchantAnswerSlot[] {
  return slots.filter((slot) => !answers?.[slot.name]?.trim());
}

/**
 * The blanks a plan's customer message leaves for the merchant, read from its
 * calls: what a parked card, which carries calls rather than a snapshot, asks.
 */
export function merchantAnswerSlotsInCalls(
  rawToolCalls: readonly { name: string; input?: unknown }[],
): MerchantAnswerSlot[] {
  const names = new Set<MerchantAnswerName>();
  const saved = blankAnswersInCalls(rawToolCalls);
  for (const call of rawToolCalls) {
    const draft = customerDraftOf(call);
    if (draft === null) continue;
    for (const name of tokenNames(draft)) if (isMerchantAnswerName(name) && !saved[name]) names.add(name);
  }
  return merchantAnswerSlots([...names].map((placeholder) => ({ placeholder, source: "merchant" as const })));
}
