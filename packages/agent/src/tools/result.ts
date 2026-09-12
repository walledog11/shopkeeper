// Structured result every tool implementation returns. The executor and planner
// branch on `status`; `message` is the only text the model ever sees, so wording
// can change without touching control flow.
export type ToolStatus = "ok" | "error" | "not_found" | "policy_block" | "escalated" | "unknown";

export interface ReceiptTargetV1 {
  kind: string;
  id: string;
}

interface ReceiptBaseV1<TTool extends string = string> {
  version: 1;
  operationId: string;
  executionId: string;
  tool: TTool;
  target: ReceiptTargetV1;
  observedAt: string;
  providerReference: string | null;
}

export interface RefundReceiptFactsV1 {
  orderId: string;
  refundId: string;
  amount: string;
  currency: string;
  transactionStatus: string;
  transactionReference: string;
  classification: "full" | "partial";
}

export interface PartialRefundReceiptFactsV1 extends RefundReceiptFactsV1 {
  classification: "partial";
  lineItems: Array<{ lineItemId: string; quantity: number }>;
}

export interface CancellationReceiptFactsV1 {
  orderId: string;
  cancelledAt: string;
  reason: string;
  financialStatus: string;
  restockResult: string | null;
}

export type ReceiptSuccessV1 =
  | (ReceiptBaseV1<"create_refund"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: RefundReceiptFactsV1;
    })
  | (ReceiptBaseV1<"create_partial_refund"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: PartialRefundReceiptFactsV1;
    })
  | (ReceiptBaseV1<"cancel_order"> & {
      outcome: "succeeded";
      providerReference: string | null;
      facts: CancellationReceiptFactsV1;
    });

type ReceiptToolV1 = ReceiptSuccessV1["tool"];

export type ReceiptFailureV1 = ReceiptBaseV1<ReceiptToolV1> & {
  outcome: "not_found" | "rejected" | "failed" | "unknown";
  code: string;
};

export type ReceiptV1 = ReceiptSuccessV1 | ReceiptFailureV1;

export interface ToolResult {
  status: ToolStatus;
  message: string;
  data?: unknown;
  receipt?: ReceiptV1;
}

export class ReceiptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReceiptValidationError(`${field} must be a non-empty string`);
  }
}

function requireIsoTimestamp(value: unknown, field: string): asserts value is string {
  requireNonEmptyString(value, field);
  if (Number.isNaN(Date.parse(value))) {
    throw new ReceiptValidationError(`${field} must be an ISO timestamp`);
  }
}

function requirePositiveDecimal(value: unknown, field: string): asserts value is string {
  requireNonEmptyString(value, field);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || !/[1-9]/.test(value)) {
    throw new ReceiptValidationError(`${field} must be a positive exact decimal string`);
  }
}

function parseBaseReceipt(value: Record<string, unknown>): ReceiptBaseV1 {
  if (value.version !== 1) throw new ReceiptValidationError("receipt version must be 1");
  requireNonEmptyString(value.operationId, "operationId");
  requireNonEmptyString(value.executionId, "executionId");
  requireNonEmptyString(value.tool, "tool");
  requireIsoTimestamp(value.observedAt, "observedAt");
  if (!isRecord(value.target)) throw new ReceiptValidationError("target must be an object");
  requireNonEmptyString(value.target.kind, "target.kind");
  requireNonEmptyString(value.target.id, "target.id");
  if (value.providerReference !== null && typeof value.providerReference !== "string") {
    throw new ReceiptValidationError("providerReference must be a string or null");
  }
  return value as unknown as ReceiptBaseV1;
}

function requireRegisteredReceiptTool(tool: string): asserts tool is ReceiptToolV1 {
  if (tool !== "create_refund" && tool !== "create_partial_refund" && tool !== "cancel_order") {
    throw new ReceiptValidationError(`no receipt validator is registered for ${tool}`);
  }
}

function parseRefundFacts(value: unknown, partial: boolean): RefundReceiptFactsV1 | PartialRefundReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("refund facts must be an object");
  requireNonEmptyString(value.orderId, "facts.orderId");
  requireNonEmptyString(value.refundId, "facts.refundId");
  requirePositiveDecimal(value.amount, "facts.amount");
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) {
    throw new ReceiptValidationError("facts.currency must be a three-letter uppercase code");
  }
  requireNonEmptyString(value.transactionStatus, "facts.transactionStatus");
  requireNonEmptyString(value.transactionReference, "facts.transactionReference");
  const expectedClassification = partial ? "partial" : value.classification;
  if (expectedClassification !== "full" && expectedClassification !== "partial") {
    throw new ReceiptValidationError("facts.classification must be full or partial");
  }
  if (partial) {
    if (value.classification !== "partial" || !Array.isArray(value.lineItems) || value.lineItems.length === 0) {
      throw new ReceiptValidationError("partial refund facts require partial classification and line items");
    }
    for (const [index, line] of value.lineItems.entries()) {
      if (!isRecord(line)) throw new ReceiptValidationError(`facts.lineItems[${index}] must be an object`);
      requireNonEmptyString(line.lineItemId, `facts.lineItems[${index}].lineItemId`);
      if (!Number.isSafeInteger(line.quantity) || Number(line.quantity) <= 0) {
        throw new ReceiptValidationError(`facts.lineItems[${index}].quantity must be a positive integer`);
      }
    }
  }
  return value as unknown as RefundReceiptFactsV1 | PartialRefundReceiptFactsV1;
}

function parseCancellationFacts(value: unknown): CancellationReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("cancellation facts must be an object");
  requireNonEmptyString(value.orderId, "facts.orderId");
  requireIsoTimestamp(value.cancelledAt, "facts.cancelledAt");
  requireNonEmptyString(value.reason, "facts.reason");
  requireNonEmptyString(value.financialStatus, "facts.financialStatus");
  if (value.restockResult !== null && typeof value.restockResult !== "string") {
    throw new ReceiptValidationError("facts.restockResult must be a string or null");
  }
  return value as unknown as CancellationReceiptFactsV1;
}

export function parseReceiptV1(value: unknown): ReceiptV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("receipt must be an object");
  const base = parseBaseReceipt(value);
  requireRegisteredReceiptTool(base.tool);
  if (base.target.kind !== "order") {
    throw new ReceiptValidationError(`${base.tool} receipt target must be an order`);
  }
  if (value.outcome === "succeeded") {
    if (base.tool === "create_refund" || base.tool === "create_partial_refund") {
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseRefundFacts(value.facts, base.tool === "create_partial_refund");
      if (base.target.kind !== "order" || base.target.id !== facts.orderId) {
        throw new ReceiptValidationError("refund target must match facts.orderId");
      }
      if (value.providerReference !== facts.refundId) {
        throw new ReceiptValidationError("refund providerReference must match facts.refundId");
      }
    } else if (base.tool === "cancel_order") {
      const facts = parseCancellationFacts(value.facts);
      if (base.target.kind !== "order" || base.target.id !== facts.orderId) {
        throw new ReceiptValidationError("cancellation target must match facts.orderId");
      }
    }
  } else if (
    value.outcome === "not_found"
    || value.outcome === "rejected"
    || value.outcome === "failed"
    || value.outcome === "unknown"
  ) {
    requireNonEmptyString(value.code, "code");
  } else {
    throw new ReceiptValidationError("receipt outcome is invalid");
  }
  return value as unknown as ReceiptV1;
}

const RECEIPT_OUTCOME_STATUS: Record<ReceiptV1["outcome"], ToolStatus> = {
  succeeded: "ok",
  not_found: "not_found",
  rejected: "policy_block",
  failed: "error",
  unknown: "unknown",
};

export function validateToolResultReceipt(
  result: ToolResult,
  expected?: { tool?: string; operationId?: string; executionId?: string },
): ReceiptV1 | undefined {
  if (result.receipt === undefined) return undefined;
  const receipt = parseReceiptV1(result.receipt);
  if (expected?.tool && receipt.tool !== expected.tool) {
    throw new ReceiptValidationError(`receipt tool ${receipt.tool} does not match ${expected.tool}`);
  }
  if (expected?.operationId && receipt.operationId !== expected.operationId) {
    throw new ReceiptValidationError("receipt operationId does not match the runtime operation");
  }
  if (expected?.executionId && receipt.executionId !== expected.executionId) {
    throw new ReceiptValidationError("receipt executionId does not match the runtime execution");
  }
  const expectedStatus = RECEIPT_OUTCOME_STATUS[receipt.outcome];
  if (result.status !== expectedStatus) {
    throw new ReceiptValidationError(
      `receipt outcome ${receipt.outcome} requires tool status ${expectedStatus}, received ${result.status}`,
    );
  }
  return receipt;
}

export function receiptAsUnknown(receipt: ReceiptV1, code: string): ReceiptFailureV1 {
  return {
    version: receipt.version,
    operationId: receipt.operationId,
    executionId: receipt.executionId,
    tool: receipt.tool,
    target: receipt.target,
    observedAt: new Date().toISOString(),
    providerReference: receipt.providerReference,
    outcome: "unknown",
    code,
  };
}

export function toolOk(message: string, data?: unknown): ToolResult {
  return data === undefined ? { status: "ok", message } : { status: "ok", message, data };
}

export function toolEscalated(reason: string): ToolResult {
  return { status: "escalated", message: reason };
}

export function toolError(message: string): ToolResult {
  return { status: "error", message };
}

export function toolPolicyBlock(message: string, data?: unknown): ToolResult {
  return data === undefined
    ? { status: "policy_block", message }
    : { status: "policy_block", message, data };
}

export function toolUnknown(message: string): ToolResult {
  return { status: "unknown", message };
}

export function toolNotFound(message: string): ToolResult {
  return { status: "not_found", message };
}
