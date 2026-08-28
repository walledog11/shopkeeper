/**
 * The `flag_order` audit-record contract, owned in one place.
 *
 * An order-ops finding persists as an `AgentAction` row: the order id in the
 * turn instruction, the reason in the tool input, and a human summary sentence.
 * Both dashboard surfaces used to recover the order *name* by regex-matching
 * that sentence — with two different regexes, neither bound to the producer, so
 * rewording the sentence degraded both silently.
 *
 * New rows carry the identity structurally (`buildFlagOrderInput`). The sentence
 * is display-only. `legacyOrderNameFromSummary` stays for rows written before
 * that, and is the only parser of it left.
 *
 * Kept dependency-free on purpose: the dashboard reads this from a client
 * bundle, so it must not reach the Anthropic SDK through `order-ops/index.ts`.
 */

export const ORDER_RISK_INSTRUCTION_PREFIX = "order-risk-review:";

export interface FlagOrderIdentity {
  orderId: string;
  orderName: string;
}

export interface FlagOrderRecordedInput extends FlagOrderIdentity {
  reason: string;
}

/** What the executor persists as the `flag_order` action's input. */
export function buildFlagOrderInput(
  modelInput: unknown,
  identity: FlagOrderIdentity,
): FlagOrderRecordedInput {
  return {
    ...(modelInput && typeof modelInput === "object" ? modelInput : {}),
    orderId: identity.orderId,
    orderName: identity.orderName,
  } as FlagOrderRecordedInput;
}

/** The summary sentence the merchant reads. Display-only — never parsed back. */
export function formatFlagOrderSummary(orderName: string, reason: string): string {
  return `Flagged order ${orderName} for review: ${reason}`;
}

export function buildOrderRiskInstruction(orderId: string): string {
  return `${ORDER_RISK_INSTRUCTION_PREFIX}${orderId}`;
}

export function parseOrderRiskInstruction(
  instruction: string | null | undefined,
): { orderId: string } | null {
  if (!instruction?.startsWith(ORDER_RISK_INSTRUCTION_PREFIX)) return null;
  const orderId = instruction.slice(ORDER_RISK_INSTRUCTION_PREFIX.length).trim();
  return orderId ? { orderId } : null;
}

function readStringField(input: unknown, field: string): string | null {
  if (!input || typeof input !== "object") return null;
  const value = (input as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Rows written before the identity was structured. Pinned to the exact template
 * `formatFlagOrderSummary` produces, and tested against it, so the two cannot
 * drift apart the way the two ad-hoc regexes did.
 */
export function legacyOrderNameFromSummary(summary: string | null | undefined): string | null {
  if (!summary) return null;
  return summary.match(/^Flagged order (.+?) for review:/)?.[1]?.trim() || null;
}

function legacyReasonFromSummary(summary: string | null | undefined): string | null {
  if (!summary) return null;
  const [, ...rest] = summary.split(" for review:");
  return rest.join(" for review:").trim() || null;
}

export interface FlagOrderFinding {
  orderId: string | null;
  orderName: string;
  reason: string;
}

/** Read a finding back, preferring structure and falling back to the sentence. */
export function readFlagOrderFinding(row: {
  input: unknown;
  instruction: string | null | undefined;
  summary: string | null | undefined;
}): FlagOrderFinding {
  const orderId = readStringField(row.input, "orderId")
    ?? parseOrderRiskInstruction(row.instruction)?.orderId
    ?? null;
  const orderName = readStringField(row.input, "orderName")
    ?? legacyOrderNameFromSummary(row.summary)
    ?? (orderId ? `Order ${orderId}` : "An order");
  const reason = readStringField(row.input, "reason")
    ?? legacyReasonFromSummary(row.summary)
    ?? "Flagged for review";

  return { orderId, orderName, reason };
}
