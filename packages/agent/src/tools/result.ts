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

export interface ReturnReceiptFactsV1 {
  orderId: string;
  returnId: string;
  returnName: string;
  status: string;
  lineItems: Array<{ fulfillmentLineItemId: string; quantity: number }>;
  refundIssued: false;
}

export interface ExchangeReceiptFactsV1 {
  orderId: string;
  returnId: string;
  returnName: string;
  status: string;
  returnedItems: Array<{
    variantId: string;
    fulfillmentLineItemId: string;
    quantity: number;
  }>;
  replacementItems: Array<{ variantId: string; quantity: number }>;
  financialConsequence: {
    kind: "refund" | "charge";
    amount: string;
    currency: string;
  } | null;
}

export interface ReturnLabelReceiptFactsV1 {
  orderId: string;
  returnId: string;
  reverseFulfillmentOrderId: string;
  reverseDeliveryId: string;
  labelSha256: string;
  trackingNumber: string | null;
  attachmentState: "attached";
}

export interface FulfillmentReceiptFactsV1 {
  orderId: string;
  fulfillmentId: string;
  status: string;
  fulfilledAt: string;
  lineItems: Array<{ fulfillmentLineItemId: string; lineItemId: string; quantity: number }>;
  tracking: {
    number: string | null;
    company: string | null;
    url: string | null;
  };
  notifyCustomerRequested: boolean;
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
    })
  | (ReceiptBaseV1<"create_return"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: ReturnReceiptFactsV1;
    })
  | (ReceiptBaseV1<"create_exchange"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: ExchangeReceiptFactsV1;
    })
  | (ReceiptBaseV1<"attach_return_label"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: ReturnLabelReceiptFactsV1;
    })
  | (ReceiptBaseV1<"fulfill_order"> & {
      outcome: "succeeded";
      providerReference: string;
      facts: FulfillmentReceiptFactsV1;
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
  if (
    tool !== "create_refund"
    && tool !== "create_partial_refund"
    && tool !== "cancel_order"
    && tool !== "create_return"
    && tool !== "create_exchange"
    && tool !== "attach_return_label"
    && tool !== "fulfill_order"
  ) {
    throw new ReceiptValidationError(`no receipt validator is registered for ${tool}`);
  }
}

function parseFulfillmentFacts(value: unknown): FulfillmentReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("fulfillment facts must be an object");
  requireNonEmptyString(value.orderId, "facts.orderId");
  requireNonEmptyString(value.fulfillmentId, "facts.fulfillmentId");
  requireNonEmptyString(value.status, "facts.status");
  requireIsoTimestamp(value.fulfilledAt, "facts.fulfilledAt");
  if (!Array.isArray(value.lineItems) || value.lineItems.length === 0) {
    throw new ReceiptValidationError("fulfillment facts require line items");
  }
  for (const [index, item] of value.lineItems.entries()) {
    if (!isRecord(item)) {
      throw new ReceiptValidationError(`facts.lineItems[${index}] must be an object`);
    }
    requireNonEmptyString(
      item.fulfillmentLineItemId,
      `facts.lineItems[${index}].fulfillmentLineItemId`,
    );
    requireNonEmptyString(item.lineItemId, `facts.lineItems[${index}].lineItemId`);
    requirePositiveQuantity(item.quantity, `facts.lineItems[${index}].quantity`);
  }
  if (!isRecord(value.tracking)) {
    throw new ReceiptValidationError("facts.tracking must be an object");
  }
  for (const field of ["number", "company", "url"] as const) {
    if (value.tracking[field] !== null) {
      requireNonEmptyString(value.tracking[field], `facts.tracking.${field}`);
    }
  }
  if (typeof value.notifyCustomerRequested !== "boolean") {
    throw new ReceiptValidationError("facts.notifyCustomerRequested must be a boolean");
  }
  return value as unknown as FulfillmentReceiptFactsV1;
}

function parseReturnLabelFacts(value: unknown): ReturnLabelReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("return label facts must be an object");
  requireNonEmptyString(value.orderId, "facts.orderId");
  requireNonEmptyString(value.returnId, "facts.returnId");
  requireNonEmptyString(value.reverseFulfillmentOrderId, "facts.reverseFulfillmentOrderId");
  requireNonEmptyString(value.reverseDeliveryId, "facts.reverseDeliveryId");
  if (typeof value.labelSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.labelSha256)) {
    throw new ReceiptValidationError("facts.labelSha256 must be a lowercase SHA-256 digest");
  }
  if (value.trackingNumber !== null) {
    requireNonEmptyString(value.trackingNumber, "facts.trackingNumber");
  }
  if (value.attachmentState !== "attached") {
    throw new ReceiptValidationError("facts.attachmentState must be attached");
  }
  return value as unknown as ReturnLabelReceiptFactsV1;
}

function parseReturnFacts(value: unknown): ReturnReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("return facts must be an object");
  requireNonEmptyString(value.orderId, "facts.orderId");
  requireNonEmptyString(value.returnId, "facts.returnId");
  requireNonEmptyString(value.returnName, "facts.returnName");
  requireNonEmptyString(value.status, "facts.status");
  if (!Array.isArray(value.lineItems) || value.lineItems.length === 0) {
    throw new ReceiptValidationError("return facts require line items");
  }
  for (const [index, line] of value.lineItems.entries()) {
    if (!isRecord(line)) throw new ReceiptValidationError(`facts.lineItems[${index}] must be an object`);
    requireNonEmptyString(
      line.fulfillmentLineItemId,
      `facts.lineItems[${index}].fulfillmentLineItemId`,
    );
    if (!Number.isSafeInteger(line.quantity) || Number(line.quantity) <= 0) {
      throw new ReceiptValidationError(`facts.lineItems[${index}].quantity must be a positive integer`);
    }
  }
  if (value.refundIssued !== false) {
    throw new ReceiptValidationError("facts.refundIssued must be false");
  }
  return value as unknown as ReturnReceiptFactsV1;
}

function requirePositiveQuantity(value: unknown, field: string): void {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new ReceiptValidationError(`${field} must be a positive integer`);
  }
}

function parseExchangeFacts(value: unknown): ExchangeReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("exchange facts must be an object");
  requireNonEmptyString(value.orderId, "facts.orderId");
  requireNonEmptyString(value.returnId, "facts.returnId");
  requireNonEmptyString(value.returnName, "facts.returnName");
  requireNonEmptyString(value.status, "facts.status");
  if (!Array.isArray(value.returnedItems) || value.returnedItems.length === 0) {
    throw new ReceiptValidationError("exchange facts require returned items");
  }
  for (const [index, item] of value.returnedItems.entries()) {
    if (!isRecord(item)) throw new ReceiptValidationError(`facts.returnedItems[${index}] must be an object`);
    requireNonEmptyString(item.variantId, `facts.returnedItems[${index}].variantId`);
    requireNonEmptyString(
      item.fulfillmentLineItemId,
      `facts.returnedItems[${index}].fulfillmentLineItemId`,
    );
    requirePositiveQuantity(item.quantity, `facts.returnedItems[${index}].quantity`);
  }
  if (!Array.isArray(value.replacementItems) || value.replacementItems.length === 0) {
    throw new ReceiptValidationError("exchange facts require replacement items");
  }
  for (const [index, item] of value.replacementItems.entries()) {
    if (!isRecord(item)) throw new ReceiptValidationError(`facts.replacementItems[${index}] must be an object`);
    requireNonEmptyString(item.variantId, `facts.replacementItems[${index}].variantId`);
    requirePositiveQuantity(item.quantity, `facts.replacementItems[${index}].quantity`);
  }
  if (value.financialConsequence !== null) {
    if (!isRecord(value.financialConsequence)) {
      throw new ReceiptValidationError("facts.financialConsequence must be an object or null");
    }
    if (
      value.financialConsequence.kind !== "refund"
      && value.financialConsequence.kind !== "charge"
    ) {
      throw new ReceiptValidationError("facts.financialConsequence.kind must be refund or charge");
    }
    requirePositiveDecimal(value.financialConsequence.amount, "facts.financialConsequence.amount");
    if (
      typeof value.financialConsequence.currency !== "string"
      || !/^[A-Z]{3}$/.test(value.financialConsequence.currency)
    ) {
      throw new ReceiptValidationError("facts.financialConsequence.currency must be a three-letter uppercase code");
    }
  }
  return value as unknown as ExchangeReceiptFactsV1;
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
    } else if (base.tool === "create_return") {
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseReturnFacts(value.facts);
      if (base.target.id !== facts.orderId) {
        throw new ReceiptValidationError("return target must match facts.orderId");
      }
      if (value.providerReference !== facts.returnId) {
        throw new ReceiptValidationError("return providerReference must match facts.returnId");
      }
    } else if (base.tool === "create_exchange") {
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseExchangeFacts(value.facts);
      if (base.target.id !== facts.orderId) {
        throw new ReceiptValidationError("exchange target must match facts.orderId");
      }
      if (value.providerReference !== facts.returnId) {
        throw new ReceiptValidationError("exchange providerReference must match facts.returnId");
      }
    } else if (base.tool === "attach_return_label") {
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseReturnLabelFacts(value.facts);
      if (base.target.id !== facts.orderId) {
        throw new ReceiptValidationError("return label target must match facts.orderId");
      }
      if (value.providerReference !== facts.reverseDeliveryId) {
        throw new ReceiptValidationError(
          "return label providerReference must match facts.reverseDeliveryId",
        );
      }
    } else if (base.tool === "fulfill_order") {
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseFulfillmentFacts(value.facts);
      if (base.target.id !== facts.orderId) {
        throw new ReceiptValidationError("fulfillment target must match facts.orderId");
      }
      if (value.providerReference !== facts.fulfillmentId) {
        throw new ReceiptValidationError(
          "fulfillment providerReference must match facts.fulfillmentId",
        );
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
