import { isRecord } from '@shopkeeper/shared/guards';
import type {
  AddressReceiptAddressV1,
  CancellationReceiptFactsV1,
  CommunicationReceiptFactsV1,
  CustomerInfoReceiptFactsV1,
  CustomerInfoReceiptFieldV1,
  CustomerNoteReceiptFactsV1,
  ExchangeReceiptFactsV1,
  FlashSaleReceiptFactsV1,
  FulfillmentReceiptFactsV1,
  GiftCardReceiptFactsV1,
  InternalNoteReceiptFactsV1,
  OrderAddressReceiptFactsV1,
  OrderCreationReceiptFactsV1,
  OrderEditReceiptFactsV1,
  PartialRefundReceiptFactsV1,
  ReceiptBaseV1,
  ReceiptFailureV1,
  ReceiptToolV1,
  ReceiptV1,
  RefundReceiptFactsV1,
  ReturnLabelReceiptFactsV1,
  ReturnReceiptFactsV1,
  ThreadStatusReceiptFactsV1,
  ThreadTagReceiptFactsV1,
  TicketSpamReceiptFactsV1,
  ToolResult,
  ToolStatus,
  VariantPriceReceiptFactsV1,
  EndFlashSaleReceiptFactsV1,
} from './receipt-v1-types.js';

export type { ReceiptV1 } from './receipt-v1-types.js';

export class ReceiptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptValidationError";
  }
}

function requireOneOf<T extends string>(value: unknown, field: string, choices: readonly T[]): asserts value is T {
  if (!choices.some(choice => choice === value)) {
    throw new ReceiptValidationError(`${field} is invalid`);
  }
}

function requireCurrency(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    throw new ReceiptValidationError(`${field} must be a three-letter uppercase code`);
  }
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

function parseCommunicationFacts(value: unknown): CommunicationReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("communication facts must be an object");
  requireNonEmptyString(value.logicalResponseId, "facts.logicalResponseId");
  requireNonEmptyString(value.messageId, "facts.messageId");
  requireNonEmptyString(value.threadId, "facts.threadId");
  if (!isRecord(value.destination)) throw new ReceiptValidationError("facts.destination must be an object");
  requireOneOf(value.destination.kind, "facts.destination.kind", ["thread", "email"]);
  requireNonEmptyString(value.destination.id, "facts.destination.id");
  if (typeof value.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.contentSha256)) {
    throw new ReceiptValidationError("facts.contentSha256 must be a SHA-256 digest");
  }
  requireOneOf(value.deliveryState, "facts.deliveryState", ["accepted", "sent", "delivered", "unknown"]);
  if (value.providerMessageId !== null && typeof value.providerMessageId !== "string") {
    throw new ReceiptValidationError("facts.providerMessageId must be a string or null");
  }
  return value as unknown as CommunicationReceiptFactsV1;
}

function parseInternalNoteFacts(value: unknown): InternalNoteReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("internal note facts must be an object");
  requireNonEmptyString(value.threadId, "facts.threadId");
  requireNonEmptyString(value.messageId, "facts.messageId");
  if (typeof value.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.contentSha256)) {
    throw new ReceiptValidationError("facts.contentSha256 must be a SHA-256 digest");
  }
  return value as unknown as InternalNoteReceiptFactsV1;
}

function parseThreadStatusFacts(value: unknown): ThreadStatusReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("thread status facts must be an object");
  requireNonEmptyString(value.threadId, "facts.threadId");
  requireNonEmptyString(value.beforeStatus, "facts.beforeStatus");
  requireNonEmptyString(value.afterStatus, "facts.afterStatus");
  return value as unknown as ThreadStatusReceiptFactsV1;
}

function parseThreadTagFacts(value: unknown): ThreadTagReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("thread tag facts must be an object");
  requireNonEmptyString(value.threadId, "facts.threadId");
  if (value.beforeTag !== null && typeof value.beforeTag !== "string") {
    throw new ReceiptValidationError("facts.beforeTag must be a string or null");
  }
  requireNonEmptyString(value.afterTag, "facts.afterTag");
  return value as unknown as ThreadTagReceiptFactsV1;
}

function parseTicketSpamFacts(value: unknown): TicketSpamReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("ticket spam facts must be an object");
  requireNonEmptyString(value.threadId, "facts.threadId");
  requireNonEmptyString(value.beforeFilterState, "facts.beforeFilterState");
  if (value.afterFilterState !== "filtered") {
    throw new ReceiptValidationError("facts.afterFilterState must be filtered");
  }
  requireIsoTimestamp(value.decidedAt, "facts.decidedAt");
  return value as unknown as TicketSpamReceiptFactsV1;
}

function requireMoneyDecimal(value: unknown, field: string): asserts value is string {
  requireNonEmptyString(value, field);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new ReceiptValidationError(`${field} must be an exact non-negative decimal string`);
  }
}

function parseVariantPriceFacts(value: unknown): VariantPriceReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("variant price facts must be an object");
  if (value.currency !== null && (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency))) {
    throw new ReceiptValidationError("facts.currency must be a three-letter uppercase code or null");
  }
  if (!Array.isArray(value.batches) || value.batches.length === 0) {
    throw new ReceiptValidationError("facts.batches must be a non-empty array");
  }
  const products = new Set<string>();
  const variants = new Set<string>();
  for (const [batchIndex, candidate] of value.batches.entries()) {
    if (!isRecord(candidate)) {
      throw new ReceiptValidationError(`facts.batches[${batchIndex}] must be an object`);
    }
    requireNonEmptyString(candidate.productId, `facts.batches[${batchIndex}].productId`);
    if (products.has(candidate.productId)) {
      throw new ReceiptValidationError("facts.batches product IDs must be unique");
    }
    products.add(candidate.productId);
    requireOneOf(candidate.outcome, `facts.batches[${batchIndex}].outcome`, ["succeeded", "failed", "unknown"]);
    requireOneOf(candidate.confirmation, `facts.batches[${batchIndex}].confirmation`, [
      "mutation_response", "read_after_ambiguous_response", "provider_rejected", "not_attempted",
    ]);
    if (!Array.isArray(candidate.changes) || candidate.changes.length === 0) {
      throw new ReceiptValidationError(`facts.batches[${batchIndex}].changes must be a non-empty array`);
    }
    for (const [changeIndex, change] of candidate.changes.entries()) {
      if (!isRecord(change)) {
        throw new ReceiptValidationError(`facts.batches[${batchIndex}].changes[${changeIndex}] must be an object`);
      }
      requireNonEmptyString(change.productId, `facts.batches[${batchIndex}].changes[${changeIndex}].productId`);
      requireNonEmptyString(change.variantId, `facts.batches[${batchIndex}].changes[${changeIndex}].variantId`);
      if (change.productId !== candidate.productId) {
        throw new ReceiptValidationError("variant price change product must match its batch");
      }
      if (variants.has(change.variantId)) {
        throw new ReceiptValidationError("variant price receipt variants must be unique");
      }
      variants.add(change.variantId);
      requireMoneyDecimal(change.originalPrice, `facts.batches[${batchIndex}].changes[${changeIndex}].originalPrice`);
      requireMoneyDecimal(change.requestedPrice, `facts.batches[${batchIndex}].changes[${changeIndex}].requestedPrice`);
      if (change.observedPrice !== null) {
        requireMoneyDecimal(change.observedPrice, `facts.batches[${batchIndex}].changes[${changeIndex}].observedPrice`);
      }
      if (candidate.outcome === "succeeded" && change.observedPrice !== change.requestedPrice) {
        throw new ReceiptValidationError("successful variant price changes must observe the requested price");
      }
    }
  }
  return value as unknown as VariantPriceReceiptFactsV1;
}

function parseEndFlashSaleFacts(value: unknown): EndFlashSaleReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("ended flash sale facts must be an object");
  requireNonEmptyString(value.flashSaleId, "facts.flashSaleId");
  requireOneOf(value.confirmation, "facts.confirmation", ["deleted", "absent_after_ambiguous_response"]);
  return value as unknown as EndFlashSaleReceiptFactsV1;
}

function parseFlashSaleFacts(value: unknown): FlashSaleReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("flash sale facts must be an object");
  requireNonEmptyString(value.flashSaleId, "facts.flashSaleId");
  requireOneOf(value.appliesTo, "facts.appliesTo", ["entire_catalog", "variants"]);
  if (!Array.isArray(value.variantIds)) {
    throw new ReceiptValidationError("facts.variantIds must be an array");
  }
  const seen = new Set<string>();
  for (const [index, variantId] of value.variantIds.entries()) {
    requireNonEmptyString(variantId, `facts.variantIds[${index}]`);
    if (seen.has(variantId)) {
      throw new ReceiptValidationError("facts.variantIds must be unique");
    }
    seen.add(variantId);
  }
  if (value.appliesTo === "entire_catalog" && value.variantIds.length !== 0) {
    throw new ReceiptValidationError("catalog flash sale facts cannot name variants");
  }
  if (value.appliesTo === "variants" && value.variantIds.length === 0) {
    throw new ReceiptValidationError("variant flash sale facts require variants");
  }
  requirePositiveDecimal(value.discountPercentage, "facts.discountPercentage");
  if (Number(value.discountPercentage) > 100) {
    throw new ReceiptValidationError("facts.discountPercentage cannot exceed 100");
  }
  requireIsoTimestamp(value.startsAt, "facts.startsAt");
  requireIsoTimestamp(value.endsAt, "facts.endsAt");
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    throw new ReceiptValidationError("facts.endsAt must be after facts.startsAt");
  }
  requireNonEmptyString(value.providerStatus, "facts.providerStatus");
  return value as unknown as FlashSaleReceiptFactsV1;
}

function parseGiftCardFacts(value: unknown): GiftCardReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("gift card facts must be an object");
  requireNonEmptyString(value.giftCardId, "facts.giftCardId");
  requireNonEmptyString(value.customerId, "facts.customerId");
  requirePositiveDecimal(value.amount, "facts.amount");
  requireCurrency(value.currency, "facts.currency");
  if (typeof value.codeSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.codeSha256)) {
    throw new ReceiptValidationError("facts.codeSha256 must be a SHA-256 digest");
  }
  if (typeof value.lastCharacters !== "string" || !/^[a-z0-9]{4}$/i.test(value.lastCharacters)) {
    throw new ReceiptValidationError("facts.lastCharacters must be four alphanumeric characters");
  }
  if (value.expiresOn !== null && (typeof value.expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.expiresOn))) {
    throw new ReceiptValidationError("facts.expiresOn must be an ISO date or null");
  }
  if (value.notificationRequested !== true) {
    throw new ReceiptValidationError("facts.notificationRequested must be true");
  }
  return value as unknown as GiftCardReceiptFactsV1;
}

function parseCustomerNoteFacts(value: unknown): CustomerNoteReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("customer note facts must be an object");
  requireNonEmptyString(value.customerId, "facts.customerId");
  for (const field of ["previousNoteSha256", "appendedNoteSha256", "resultingNoteSha256"] as const) {
    if (typeof value[field] !== "string" || !/^[a-f0-9]{64}$/.test(value[field])) {
      throw new ReceiptValidationError(`facts.${field} must be a SHA-256 digest`);
    }
  }
  requirePositiveInteger(value.resultingNoteLength, "facts.resultingNoteLength");
  if (value.appendState !== "appended") {
    throw new ReceiptValidationError("facts.appendState must be appended");
  }
  return value as unknown as CustomerNoteReceiptFactsV1;
}

function parseCustomerInfoFacts(value: unknown): CustomerInfoReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("customer info facts must be an object");
  requireNonEmptyString(value.customerId, "facts.customerId");
  if (!Array.isArray(value.updates) || value.updates.length === 0) {
    throw new ReceiptValidationError("customer info facts require updates");
  }
  const allowedFields = new Set<CustomerInfoReceiptFieldV1>(["firstName", "lastName", "email", "phone"]);
  const seen = new Set<CustomerInfoReceiptFieldV1>();
  for (const [index, update] of value.updates.entries()) {
    const field = `facts.updates[${index}]`;
    if (!isRecord(update) || typeof update.field !== "string" || !allowedFields.has(update.field as CustomerInfoReceiptFieldV1)) {
      throw new ReceiptValidationError(`${field}.field is invalid`);
    }
    const updateField = update.field as CustomerInfoReceiptFieldV1;
    if (seen.has(updateField)) throw new ReceiptValidationError(`${field}.field must be unique`);
    seen.add(updateField);
    requireNonEmptyString(update.value, `${field}.value`);
  }
  return value as unknown as CustomerInfoReceiptFactsV1;
}

function parseOrderCreationFacts(value: unknown): OrderCreationReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("order creation facts must be an object");
  requireNonEmptyString(value.orderId, "facts.orderId");
  requireNonEmptyString(value.orderName, "facts.orderName");
  requireNonEmptyString(value.operationTag, "facts.operationTag");
  if (!/^shopkeeper-op-[a-f0-9]{24}$/.test(value.operationTag)) {
    throw new ReceiptValidationError("facts.operationTag must be a deterministic Shopkeeper operation tag");
  }
  requireNonEmptyString(value.financialStatus, "facts.financialStatus");
  requireNonEmptyString(value.adminUrl, "facts.adminUrl");
  let adminUrl: URL;
  try {
    adminUrl = new URL(value.adminUrl);
  } catch {
    throw new ReceiptValidationError("facts.adminUrl must be a valid URL");
  }
  if (adminUrl.protocol !== "https:" || !adminUrl.pathname.endsWith(`/admin/orders/${value.orderId}`)) {
    throw new ReceiptValidationError("facts.adminUrl must identify the created order");
  }
  requireNonEmptyString(value.totalAmount, "facts.totalAmount");
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.totalAmount)) {
    throw new ReceiptValidationError("facts.totalAmount must be a non-negative exact decimal string");
  }
  requireCurrency(value.currency, "facts.currency");
  return value as unknown as OrderCreationReceiptFactsV1;
}

function parseOrderEditFacts(
  value: unknown,
  options: { requireCommitted: boolean },
): OrderEditReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("order edit facts must be an object");
  requireNonEmptyString(value.orderId, "facts.orderId");
  if (!Array.isArray(value.changes) || value.changes.length === 0) {
    throw new ReceiptValidationError("order edit facts require changes");
  }
  for (const [index, change] of value.changes.entries()) {
    const field = `facts.changes[${index}]`;
    if (!isRecord(change)) throw new ReceiptValidationError(`${field} must be an object`);
    requireOneOf(change.kind, `${field}.kind`, ["addition", "removal"]);
    requireNonEmptyString(change.variantId, `${field}.variantId`);
    if (change.lineItemId !== null) requireNonEmptyString(change.lineItemId, `${field}.lineItemId`);
    if (change.kind === "addition") {
      requirePositiveInteger(change.requestedQuantity, `${field}.requestedQuantity`);
    } else if (change.requestedQuantity !== null) {
      throw new ReceiptValidationError(`${field}.requestedQuantity must be null for a removal`);
    }
    if (
      change.providerObservedFinalQuantity !== null
      && (!Number.isSafeInteger(change.providerObservedFinalQuantity)
        || Number(change.providerObservedFinalQuantity) < 0)
    ) {
      throw new ReceiptValidationError(
        `${field}.providerObservedFinalQuantity must be a non-negative integer or null`,
      );
    }
    requireOneOf(change.outcome, `${field}.outcome`, ["committed", "staged", "rejected", "unknown"]);
    if (
      options.requireCommitted
      && (change.outcome !== "committed" || change.providerObservedFinalQuantity === null)
    ) {
      throw new ReceiptValidationError(
        `${field} must be committed with a provider-observed final quantity`,
      );
    }
  }
  return value as unknown as OrderEditReceiptFactsV1;
}

function parseAddress(value: unknown, field: string): AddressReceiptAddressV1 {
  if (!isRecord(value)) throw new ReceiptValidationError(`${field} must be an object`);
  for (const key of ["address1", "city", "province", "postalCode", "country"] as const) {
    requireNonEmptyString(value[key], `${field}.${key}`);
  }
  for (const key of ["firstName", "lastName", "address2", "provinceCode", "countryCode"] as const) {
    if (value[key] !== null) requireNonEmptyString(value[key], `${field}.${key}`);
  }
  return value as unknown as AddressReceiptAddressV1;
}

function parseOrderAddressFacts(value: unknown): OrderAddressReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("order address facts must be an object");
  requireNonEmptyString(value.orderId, "facts.orderId");
  requireNonEmptyString(value.customerId, "facts.customerId");
  if (!isRecord(value.orderAddress)) {
    throw new ReceiptValidationError("facts.orderAddress must be an object");
  }
  if (value.orderAddress.outcome !== "updated" && value.orderAddress.outcome !== "already_matched") {
    throw new ReceiptValidationError("facts.orderAddress.outcome is invalid");
  }
  parseAddress(value.orderAddress.address, "facts.orderAddress.address");
  if (!isRecord(value.customerDefaultAddress)) {
    throw new ReceiptValidationError("facts.customerDefaultAddress must be an object");
  }
  const customerOutcome = value.customerDefaultAddress.outcome;
  if (customerOutcome === "updated" || customerOutcome === "already_matched") {
    requireNonEmptyString(value.customerDefaultAddress.addressId, "facts.customerDefaultAddress.addressId");
    parseAddress(value.customerDefaultAddress.address, "facts.customerDefaultAddress.address");
  } else if (customerOutcome === "not_updated") {
    if (value.customerDefaultAddress.code !== "no_default_address") {
      throw new ReceiptValidationError("facts.customerDefaultAddress.code is invalid");
    }
  } else if (customerOutcome === "failed" || customerOutcome === "unknown") {
    requireNonEmptyString(value.customerDefaultAddress.code, "facts.customerDefaultAddress.code");
  } else {
    throw new ReceiptValidationError("facts.customerDefaultAddress.outcome is invalid");
  }
  return value as unknown as OrderAddressReceiptFactsV1;
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
    requirePositiveInteger(item.quantity, `facts.lineItems[${index}].quantity`);
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
    requirePositiveInteger(line.quantity, `facts.lineItems[${index}].quantity`);
  }
  if (value.refundIssued !== false) {
    throw new ReceiptValidationError("facts.refundIssued must be false");
  }
  return value as unknown as ReturnReceiptFactsV1;
}

function requirePositiveInteger(value: unknown, field: string): void {
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
    requirePositiveInteger(item.quantity, `facts.returnedItems[${index}].quantity`);
  }
  if (!Array.isArray(value.replacementItems) || value.replacementItems.length === 0) {
    throw new ReceiptValidationError("exchange facts require replacement items");
  }
  for (const [index, item] of value.replacementItems.entries()) {
    if (!isRecord(item)) throw new ReceiptValidationError(`facts.replacementItems[${index}] must be an object`);
    requireNonEmptyString(item.variantId, `facts.replacementItems[${index}].variantId`);
    requirePositiveInteger(item.quantity, `facts.replacementItems[${index}].quantity`);
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
    requireCurrency(value.financialConsequence.currency, "facts.financialConsequence.currency");
  }
  return value as unknown as ExchangeReceiptFactsV1;
}

function parseRefundFacts(value: unknown, partial: boolean): RefundReceiptFactsV1 | PartialRefundReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("refund facts must be an object");
  requireNonEmptyString(value.orderId, "facts.orderId");
  requireNonEmptyString(value.refundId, "facts.refundId");
  requirePositiveDecimal(value.amount, "facts.amount");
  requireCurrency(value.currency, "facts.currency");
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
      requirePositiveInteger(line.quantity, `facts.lineItems[${index}].quantity`);
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
  if (value.refund !== undefined && value.refund !== null) {
    if (!isRecord(value.refund)) throw new ReceiptValidationError("facts.refund must be an object or null");
    requireMoneyDecimal(value.refund.amount, "facts.refund.amount");
    requireCurrency(value.refund.currency, "facts.refund.currency");
  }
  return value as unknown as CancellationReceiptFactsV1;
}

type ReceiptValidator = (base: ReceiptBaseV1, value: Record<string, unknown>) => void;
interface ReceiptContract {
  targetKind: string;
  failureTargets?: readonly string[];
  succeeded: ReceiptValidator;
  partial?: { label: string; validate: ReceiptValidator };
}

/** Shared identity checks; each fact parser still owns its domain invariants. */
function factIdentity<Facts extends object>(
  parse: (value: unknown) => Facts,
  label: string,
  targetKey: keyof Facts | null,
  providerKey?: keyof Facts,
): ReceiptValidator {
  return (base, value) => {
    if (providerKey) requireNonEmptyString(value.providerReference, "providerReference");
    const facts = parse(value.facts);
    if (targetKey && base.target.id !== facts[targetKey]) {
      throw new ReceiptValidationError(`${label} target must match facts.${String(targetKey)}`);
    }
    if (providerKey && value.providerReference !== facts[providerKey]) {
      throw new ReceiptValidationError(`${label} providerReference must match facts.${String(providerKey)}`);
    }
  };
}

function threadStateIdentity(parse: (value: unknown) => { threadId: string }, label: string): ReceiptValidator {
  return (base, value) => {
    requireNonEmptyString(value.providerReference, "providerReference");
    const facts = parse(value.facts);
    if (base.target.id !== facts.threadId || value.providerReference !== facts.threadId) {
      throw new ReceiptValidationError(`${label} identities must match the target thread`);
    }
  };
}

function validateCommunication(base: ReceiptBaseV1, value: Record<string, unknown>): void {
  requireNonEmptyString(value.providerReference, "providerReference");
  const facts = parseCommunicationFacts(value.facts);
  if (base.target.kind !== "thread" || base.target.id !== facts.threadId) {
    throw new ReceiptValidationError("communication target must match facts.threadId");
  }
  if (value.providerReference !== facts.messageId || facts.logicalResponseId !== facts.messageId) {
    throw new ReceiptValidationError("communication response identities must match the persisted message");
  }
  if (value.outcome === "succeeded" && facts.deliveryState === "unknown") {
    throw new ReceiptValidationError("successful communication cannot have unknown delivery state");
  }
  if (value.outcome === "unknown" && facts.deliveryState !== "unknown") {
    throw new ReceiptValidationError("unknown communication receipts require unknown delivery state");
  }
}

function validateVariantPriceReceipt(base: ReceiptBaseV1, value: Record<string, unknown>): void {
  requireNonEmptyString(value.providerReference, "providerReference");
  if (value.providerReference !== base.target.id) {
    throw new ReceiptValidationError("variant price providerReference must match the shop target");
  }
  const facts = parseVariantPriceFacts(value.facts);
  if (value.outcome === "succeeded" && facts.batches.some(batch => batch.outcome !== "succeeded")) {
    throw new ReceiptValidationError("successful variant price receipts require successful batches");
  }
}

const validateOrderAddressReceipt = factIdentity(parseOrderAddressFacts, "order address", "orderId", "orderId");
const communicationContract: ReceiptContract = {
  targetKind: "thread",
  succeeded: validateCommunication,
  partial: { label: "communication", validate: validateCommunication },
};

// Adding a receipt tool requires a complete success/failure contract here. The
// success union uses the same tool keys, so a validator cannot silently be absent.
const RECEIPT_CONTRACTS: Record<ReceiptToolV1, ReceiptContract> = {
  create_refund: { targetKind: "order", succeeded: factIdentity(value => parseRefundFacts(value, false), "refund", "orderId", "refundId") },
  create_partial_refund: { targetKind: "order", succeeded: factIdentity(value => parseRefundFacts(value, true), "refund", "orderId", "refundId") },
  cancel_order: { targetKind: "order", succeeded: factIdentity(parseCancellationFacts, "cancellation", "orderId") },
  create_return: { targetKind: "order", succeeded: factIdentity(parseReturnFacts, "return", "orderId", "returnId") },
  create_exchange: { targetKind: "order", succeeded: factIdentity(parseExchangeFacts, "exchange", "orderId", "returnId") },
  attach_return_label: { targetKind: "order", succeeded: factIdentity(parseReturnLabelFacts, "return label", "orderId", "reverseDeliveryId") },
  fulfill_order: { targetKind: "order", succeeded: factIdentity(parseFulfillmentFacts, "fulfillment", "orderId", "fulfillmentId") },
  update_shopify_order_address: {
    targetKind: "order", succeeded: validateOrderAddressReceipt,
    partial: { label: "partial order address", validate: validateOrderAddressReceipt },
  },
  edit_shopify_order: {
    targetKind: "order",
    succeeded: factIdentity(value => parseOrderEditFacts(value, { requireCommitted: true }), "order edit", "orderId", "orderId"),
    partial: {
      label: "partial order edit",
      validate: factIdentity(value => parseOrderEditFacts(value, { requireCommitted: false }), "order edit", "orderId", "orderId"),
    },
  },
  create_shopify_order: {
    targetKind: "order", failureTargets: ["order", "email"],
    succeeded: factIdentity(parseOrderCreationFacts, "order creation", "orderId", "orderId"),
  },
  update_shopify_customer_info: { targetKind: "customer", succeeded: factIdentity(parseCustomerInfoFacts, "customer info", "customerId", "customerId") },
  add_shopify_customer_note: { targetKind: "customer", succeeded: factIdentity(parseCustomerNoteFacts, "customer note", "customerId", "customerId") },
  create_gift_card: { targetKind: "customer", succeeded: factIdentity(parseGiftCardFacts, "gift card", "customerId", "giftCardId") },
  create_flash_sale: { targetKind: "shop", succeeded: factIdentity(parseFlashSaleFacts, "flash sale", null, "flashSaleId") },
  end_flash_sale: {
    targetKind: "discount", failureTargets: ["shop", "discount"],
    succeeded: factIdentity(parseEndFlashSaleFacts, "ended flash sale", "flashSaleId", "flashSaleId"),
  },
  set_variant_prices: {
    targetKind: "shop", succeeded: validateVariantPriceReceipt,
    partial: { label: "partial variant price", validate: validateVariantPriceReceipt },
  },
  add_internal_note: { targetKind: "thread", succeeded: factIdentity(parseInternalNoteFacts, "internal note", "threadId", "messageId") },
  update_thread_status: { targetKind: "thread", succeeded: threadStateIdentity(parseThreadStatusFacts, "thread status") },
  update_thread_tag: { targetKind: "thread", succeeded: threadStateIdentity(parseThreadTagFacts, "thread tag") },
  mark_ticket_spam: { targetKind: "thread", succeeded: threadStateIdentity(parseTicketSpamFacts, "ticket spam") },
  send_reply: communicationContract,
  send_email: { ...communicationContract, failureTargets: ["thread", "email"] },
  send_ticket_reply: communicationContract,
};

export function parseReceiptV1(value: unknown): ReceiptV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("receipt must be an object");
  const base = parseBaseReceipt(value);
  if (!Object.hasOwn(RECEIPT_CONTRACTS, base.tool)) {
    throw new ReceiptValidationError(`no receipt validator is registered for ${base.tool}`);
  }
  const contract = RECEIPT_CONTRACTS[base.tool as ReceiptToolV1];
  const succeeded = value.outcome === "succeeded";
  const targets = succeeded ? [contract.targetKind] : contract.failureTargets ?? [contract.targetKind];
  if (!targets.includes(base.target.kind)) {
    const article = targets[0] === "order" ? "an" : "a";
    throw new ReceiptValidationError(`${base.tool} receipt target must be ${article} ${targets.join(" or ")}`);
  }
  if (succeeded) {
    contract.succeeded(base, value);
  } else if (["not_found", "rejected", "failed", "unknown"].includes(value.outcome as string)) {
    requireNonEmptyString(value.code, "code");
    if (value.facts !== undefined) {
      if (!contract.partial) throw new ReceiptValidationError("failure receipt facts are not supported for this tool");
      if (value.outcome !== "unknown") {
        throw new ReceiptValidationError(`${contract.partial.label} facts require an unknown outcome`);
      }
      contract.partial.validate(base, value);
    }
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

