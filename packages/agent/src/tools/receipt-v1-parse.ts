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
    && tool !== "update_shopify_order_address"
    && tool !== "edit_shopify_order"
    && tool !== "create_shopify_order"
    && tool !== "update_shopify_customer_info"
    && tool !== "add_shopify_customer_note"
    && tool !== "create_gift_card"
    && tool !== "create_flash_sale"
    && tool !== "end_flash_sale"
    && tool !== "set_variant_prices"
    && tool !== "add_internal_note"
    && tool !== "update_thread_status"
    && tool !== "update_thread_tag"
    && tool !== "mark_ticket_spam"
    && tool !== "send_reply"
    && tool !== "send_email"
    && tool !== "send_ticket_reply"
  ) {
    throw new ReceiptValidationError(`no receipt validator is registered for ${tool}`);
  }
}

function parseCommunicationFacts(value: unknown): CommunicationReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("communication facts must be an object");
  requireNonEmptyString(value.logicalResponseId, "facts.logicalResponseId");
  requireNonEmptyString(value.messageId, "facts.messageId");
  requireNonEmptyString(value.threadId, "facts.threadId");
  if (!isRecord(value.destination)) throw new ReceiptValidationError("facts.destination must be an object");
  if (value.destination.kind !== "thread" && value.destination.kind !== "email") {
    throw new ReceiptValidationError("facts.destination.kind is invalid");
  }
  requireNonEmptyString(value.destination.id, "facts.destination.id");
  if (typeof value.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.contentSha256)) {
    throw new ReceiptValidationError("facts.contentSha256 must be a SHA-256 digest");
  }
  if (!['accepted', 'sent', 'delivered', 'unknown'].includes(String(value.deliveryState))) {
    throw new ReceiptValidationError("facts.deliveryState is invalid");
  }
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
    if (candidate.outcome !== "succeeded" && candidate.outcome !== "failed" && candidate.outcome !== "unknown") {
      throw new ReceiptValidationError(`facts.batches[${batchIndex}].outcome is invalid`);
    }
    if (
      candidate.confirmation !== "mutation_response"
      && candidate.confirmation !== "read_after_ambiguous_response"
      && candidate.confirmation !== "provider_rejected"
      && candidate.confirmation !== "not_attempted"
    ) {
      throw new ReceiptValidationError(`facts.batches[${batchIndex}].confirmation is invalid`);
    }
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
  if (
    value.confirmation !== "deleted"
    && value.confirmation !== "absent_after_ambiguous_response"
  ) {
    throw new ReceiptValidationError("facts.confirmation is invalid");
  }
  return value as unknown as EndFlashSaleReceiptFactsV1;
}

function parseFlashSaleFacts(value: unknown): FlashSaleReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("flash sale facts must be an object");
  requireNonEmptyString(value.flashSaleId, "facts.flashSaleId");
  if (value.appliesTo !== "entire_catalog" && value.appliesTo !== "variants") {
    throw new ReceiptValidationError("facts.appliesTo is invalid");
  }
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
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) {
    throw new ReceiptValidationError("facts.currency must be a three-letter uppercase code");
  }
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
  if (!Number.isSafeInteger(value.resultingNoteLength) || Number(value.resultingNoteLength) <= 0) {
    throw new ReceiptValidationError("facts.resultingNoteLength must be a positive integer");
  }
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
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) {
    throw new ReceiptValidationError("facts.currency must be a three-letter uppercase code");
  }
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
    if (change.kind !== "addition" && change.kind !== "removal") {
      throw new ReceiptValidationError(`${field}.kind is invalid`);
    }
    requireNonEmptyString(change.variantId, `${field}.variantId`);
    if (change.lineItemId !== null) requireNonEmptyString(change.lineItemId, `${field}.lineItemId`);
    if (change.kind === "addition") {
      requirePositiveQuantity(change.requestedQuantity, `${field}.requestedQuantity`);
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
    if (
      change.outcome !== "committed"
      && change.outcome !== "staged"
      && change.outcome !== "rejected"
      && change.outcome !== "unknown"
    ) {
      throw new ReceiptValidationError(`${field}.outcome is invalid`);
    }
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
  if (
    (
      base.tool === "update_shopify_customer_info"
      || base.tool === "add_shopify_customer_note"
      || base.tool === "create_gift_card"
    )
    && base.target.kind !== "customer"
  ) {
    throw new ReceiptValidationError(`${base.tool} receipt target must be a customer`);
  }
  if (
    base.tool !== "create_shopify_order"
    && base.tool !== "update_shopify_customer_info"
    && base.tool !== "add_shopify_customer_note"
    && base.tool !== "create_gift_card"
    && base.tool !== "create_flash_sale"
    && base.tool !== "end_flash_sale"
    && base.tool !== "set_variant_prices"
    && base.tool !== "add_internal_note"
    && base.tool !== "update_thread_status"
    && base.tool !== "update_thread_tag"
    && base.tool !== "mark_ticket_spam"
    && base.tool !== "send_reply"
    && base.tool !== "send_email"
    && base.tool !== "send_ticket_reply"
    && base.target.kind !== "order"
  ) {
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
    } else if (base.tool === "update_shopify_order_address") {
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseOrderAddressFacts(value.facts);
      if (base.target.id !== facts.orderId) {
        throw new ReceiptValidationError("order address target must match facts.orderId");
      }
      if (value.providerReference !== facts.orderId) {
        throw new ReceiptValidationError("order address providerReference must match facts.orderId");
      }
    } else if (base.tool === "edit_shopify_order") {
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseOrderEditFacts(value.facts, { requireCommitted: true });
      if (base.target.id !== facts.orderId) {
        throw new ReceiptValidationError("order edit target must match facts.orderId");
      }
      if (value.providerReference !== facts.orderId) {
        throw new ReceiptValidationError("order edit providerReference must match facts.orderId");
      }
    } else if (base.tool === "create_shopify_order") {
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseOrderCreationFacts(value.facts);
      if (base.target.kind !== "order" || base.target.id !== facts.orderId) {
        throw new ReceiptValidationError("order creation target must match facts.orderId");
      }
      if (value.providerReference !== facts.orderId) {
        throw new ReceiptValidationError("order creation providerReference must match facts.orderId");
      }
    } else if (base.tool === "update_shopify_customer_info") {
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseCustomerInfoFacts(value.facts);
      if (base.target.id !== facts.customerId) {
        throw new ReceiptValidationError("customer info target must match facts.customerId");
      }
      if (value.providerReference !== facts.customerId) {
        throw new ReceiptValidationError("customer info providerReference must match facts.customerId");
      }
    } else if (base.tool === "add_shopify_customer_note") {
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseCustomerNoteFacts(value.facts);
      if (base.target.id !== facts.customerId) {
        throw new ReceiptValidationError("customer note target must match facts.customerId");
      }
      if (value.providerReference !== facts.customerId) {
        throw new ReceiptValidationError("customer note providerReference must match facts.customerId");
      }
    } else if (base.tool === "create_gift_card") {
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseGiftCardFacts(value.facts);
      if (base.target.id !== facts.customerId) {
        throw new ReceiptValidationError("gift card target must match facts.customerId");
      }
      if (value.providerReference !== facts.giftCardId) {
        throw new ReceiptValidationError("gift card providerReference must match facts.giftCardId");
      }
    } else if (base.tool === "create_flash_sale") {
      if (base.target.kind !== "shop") {
        throw new ReceiptValidationError("create_flash_sale receipt target must be a shop");
      }
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseFlashSaleFacts(value.facts);
      if (value.providerReference !== facts.flashSaleId) {
        throw new ReceiptValidationError("flash sale providerReference must match facts.flashSaleId");
      }
    } else if (base.tool === "end_flash_sale") {
      if (base.target.kind !== "discount") {
        throw new ReceiptValidationError("end_flash_sale receipt target must be a discount");
      }
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseEndFlashSaleFacts(value.facts);
      if (base.target.id !== facts.flashSaleId) {
        throw new ReceiptValidationError("ended flash sale target must match facts.flashSaleId");
      }
      if (value.providerReference !== facts.flashSaleId) {
        throw new ReceiptValidationError("ended flash sale providerReference must match facts.flashSaleId");
      }
    } else if (base.tool === "set_variant_prices") {
      if (base.target.kind !== "shop") {
        throw new ReceiptValidationError("set_variant_prices receipt target must be a shop");
      }
      requireNonEmptyString(value.providerReference, "providerReference");
      if (value.providerReference !== base.target.id) {
        throw new ReceiptValidationError("variant price providerReference must match the shop target");
      }
      const facts = parseVariantPriceFacts(value.facts);
      if (facts.batches.some((batch) => batch.outcome !== "succeeded")) {
        throw new ReceiptValidationError("successful variant price receipts require successful batches");
      }
    } else if (base.tool === "add_internal_note") {
      if (base.target.kind !== "thread") throw new ReceiptValidationError("internal note target must be a thread");
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseInternalNoteFacts(value.facts);
      if (base.target.id !== facts.threadId) throw new ReceiptValidationError("internal note target must match facts.threadId");
      if (value.providerReference !== facts.messageId) throw new ReceiptValidationError("internal note providerReference must match facts.messageId");
    } else if (base.tool === "update_thread_status") {
      if (base.target.kind !== "thread") throw new ReceiptValidationError("thread status target must be a thread");
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseThreadStatusFacts(value.facts);
      if (base.target.id !== facts.threadId || value.providerReference !== facts.threadId) {
        throw new ReceiptValidationError("thread status identities must match the target thread");
      }
    } else if (base.tool === "update_thread_tag") {
      if (base.target.kind !== "thread") throw new ReceiptValidationError("thread tag target must be a thread");
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseThreadTagFacts(value.facts);
      if (base.target.id !== facts.threadId || value.providerReference !== facts.threadId) {
        throw new ReceiptValidationError("thread tag identities must match the target thread");
      }
    } else if (base.tool === "mark_ticket_spam") {
      if (base.target.kind !== "thread") throw new ReceiptValidationError("ticket spam target must be a thread");
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseTicketSpamFacts(value.facts);
      if (base.target.id !== facts.threadId || value.providerReference !== facts.threadId) {
        throw new ReceiptValidationError("ticket spam identities must match the target thread");
      }
    } else if (base.tool === "send_reply" || base.tool === "send_email" || base.tool === "send_ticket_reply") {
      if (base.target.kind !== "thread") throw new ReceiptValidationError("communication target must be a thread");
      requireNonEmptyString(value.providerReference, "providerReference");
      const facts = parseCommunicationFacts(value.facts);
      if (base.target.id !== facts.threadId) throw new ReceiptValidationError("communication target must match facts.threadId");
      if (value.providerReference !== facts.messageId || facts.logicalResponseId !== facts.messageId) {
        throw new ReceiptValidationError("communication response identities must match the persisted message");
      }
      if (facts.deliveryState === "unknown") {
        throw new ReceiptValidationError("successful communication cannot have unknown delivery state");
      }
    }
  } else if (
    value.outcome === "not_found"
    || value.outcome === "rejected"
    || value.outcome === "failed"
    || value.outcome === "unknown"
  ) {
    requireNonEmptyString(value.code, "code");
    if (
      base.tool === "create_shopify_order"
      && base.target.kind !== "order"
      && base.target.kind !== "email"
    ) {
      throw new ReceiptValidationError("create_shopify_order failure target must be an order or email");
    }
    if (base.tool === "create_flash_sale" && base.target.kind !== "shop") {
      throw new ReceiptValidationError("create_flash_sale failure target must be a shop");
    }
    if (base.tool === "set_variant_prices" && base.target.kind !== "shop") {
      throw new ReceiptValidationError("set_variant_prices failure target must be a shop");
    }
    if (
      (base.tool === "add_internal_note"
        || base.tool === "update_thread_status"
        || base.tool === "update_thread_tag"
        || base.tool === "mark_ticket_spam")
      && base.target.kind !== "thread"
    ) {
      throw new ReceiptValidationError(`${base.tool} failure target must be a thread`);
    }
    if (
      (base.tool === "send_reply" || base.tool === "send_ticket_reply")
      && base.target.kind !== "thread"
    ) {
      throw new ReceiptValidationError(`${base.tool} failure target must be a thread`);
    }
    if (base.tool === "send_email" && base.target.kind !== "thread" && base.target.kind !== "email") {
      throw new ReceiptValidationError("send_email failure target must be a thread or email");
    }
    if (
      base.tool === "end_flash_sale"
      && base.target.kind !== "shop"
      && base.target.kind !== "discount"
    ) {
      throw new ReceiptValidationError("end_flash_sale failure target must be a shop or discount");
    }
    if (value.facts !== undefined) {
      if (
        base.tool !== "update_shopify_order_address"
        && base.tool !== "edit_shopify_order"
        && base.tool !== "set_variant_prices"
        && base.tool !== "send_reply"
        && base.tool !== "send_email"
        && base.tool !== "send_ticket_reply"
      ) {
        throw new ReceiptValidationError("failure receipt facts are not supported for this tool");
      }
      if (value.outcome !== "unknown") {
        throw new ReceiptValidationError(
          base.tool === "update_shopify_order_address"
            ? "partial order address facts require an unknown outcome"
            : base.tool === "edit_shopify_order"
              ? "partial order edit facts require an unknown outcome"
              : base.tool === "set_variant_prices"
                ? "partial variant price facts require an unknown outcome"
                : "communication facts require an unknown outcome",
        );
      }
      requireNonEmptyString(value.providerReference, "providerReference");
      if (base.tool === "update_shopify_order_address") {
        const facts = parseOrderAddressFacts(value.facts);
        if (base.target.id !== facts.orderId) {
          throw new ReceiptValidationError("order address target must match facts.orderId");
        }
        if (value.providerReference !== facts.orderId) {
          throw new ReceiptValidationError("order address providerReference must match facts.orderId");
        }
      } else if (base.tool === "edit_shopify_order") {
        const facts = parseOrderEditFacts(value.facts, { requireCommitted: false });
        if (base.target.id !== facts.orderId) {
          throw new ReceiptValidationError("order edit target must match facts.orderId");
        }
        if (value.providerReference !== facts.orderId) {
          throw new ReceiptValidationError("order edit providerReference must match facts.orderId");
        }
      } else if (base.tool === "set_variant_prices") {
        if (value.providerReference !== base.target.id) {
          throw new ReceiptValidationError("variant price providerReference must match the shop target");
        }
        parseVariantPriceFacts(value.facts);
      } else {
        const facts = parseCommunicationFacts(value.facts);
        if (base.target.kind !== "thread" || base.target.id !== facts.threadId) {
          throw new ReceiptValidationError("communication target must match facts.threadId");
        }
        if (value.providerReference !== facts.messageId || facts.logicalResponseId !== facts.messageId) {
          throw new ReceiptValidationError("communication response identities must match the persisted message");
        }
        if (facts.deliveryState !== "unknown") {
          throw new ReceiptValidationError("unknown communication receipts require unknown delivery state");
        }
      }
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

