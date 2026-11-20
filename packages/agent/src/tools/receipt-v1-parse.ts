import { isRecord } from '@shopkeeper/shared/guards';
import type {
  AddressReceiptAddressV1,
  CancellationReceiptFactsV1,
  CommunicationReceiptFactsV1,
  CustomerInfoReceiptFactsV1,
  CustomerInfoReceiptFieldV1,
  CustomerNoteReceiptFactsV1,
  EndFlashSaleReceiptFactsV1,
  ExchangeReceiptFactsV1,
  FlashSaleReceiptFactsV1,
  FulfillmentReceiptFactsV1,
  GiftCardReceiptFactsV1,
  InternalNoteReceiptFactsV1,
  OrderAddressReceiptFactsV1,
  OrderCreationReceiptFactsV1,
  OrderEditReceiptChangeV1,
  OrderEditReceiptFactsV1,
  PartialRefundReceiptFactsV1,
  ReceiptBaseV1,
  ReceiptFactsByToolV1,
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
  VariantPriceReceiptBatchV1,
  VariantPriceReceiptChangeV1,
  VariantPriceReceiptFactsV1,
} from './receipt-v1-types.js';

export type { ReceiptV1 } from './receipt-v1-types.js';

export class ReceiptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptValidationError";
  }
}

// Each reader returns the value it checked, so a receipt is built only from
// fields that passed validation: a field the types gain without a check here
// fails to compile, and a field no type names is dropped rather than stored.

function oneOf<T extends string>(value: unknown, field: string, choices: readonly T[]): T {
  const match = choices.find(choice => choice === value);
  if (match === undefined) throw new ReceiptValidationError(`${field} is invalid`);
  return match;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReceiptValidationError(`${field} must be a non-empty string`);
  }
  return value;
}

/** Null, or a non-empty string. */
function optionalNonEmptyString(value: unknown, field: string): string | null {
  return value === null ? null : nonEmptyString(value, field);
}

/** Null, or any string. */
function stringOrNull(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") {
    throw new ReceiptValidationError(`${field} must be a string or null`);
  }
  return value;
}

function currencyCode(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    throw new ReceiptValidationError(`${field} must be a three-letter uppercase code`);
  }
  return value;
}

function isoTimestamp(value: unknown, field: string): string {
  const text = nonEmptyString(value, field);
  if (Number.isNaN(Date.parse(text))) {
    throw new ReceiptValidationError(`${field} must be an ISO timestamp`);
  }
  return text;
}

function positiveDecimal(value: unknown, field: string): string {
  const text = nonEmptyString(value, field);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text) || !/[1-9]/.test(text)) {
    throw new ReceiptValidationError(`${field} must be a positive exact decimal string`);
  }
  return text;
}

function moneyDecimal(value: unknown, field: string): string {
  const text = nonEmptyString(value, field);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    throw new ReceiptValidationError(`${field} must be an exact non-negative decimal string`);
  }
  return text;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new ReceiptValidationError(`${field} must be a positive integer`);
  }
  return value as number;
}

function sha256Digest(value: unknown, message: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new ReceiptValidationError(message);
  }
  return value;
}

function nonEmptyArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new ReceiptValidationError(message);
  return value;
}

function parseBaseReceipt(value: Record<string, unknown>): ReceiptBaseV1 {
  if (value.version !== 1) throw new ReceiptValidationError("receipt version must be 1");
  const operationId = nonEmptyString(value.operationId, "operationId");
  const executionId = nonEmptyString(value.executionId, "executionId");
  const tool = nonEmptyString(value.tool, "tool");
  const observedAt = isoTimestamp(value.observedAt, "observedAt");
  if (!isRecord(value.target)) throw new ReceiptValidationError("target must be an object");
  const target = {
    kind: nonEmptyString(value.target.kind, "target.kind"),
    id: nonEmptyString(value.target.id, "target.id"),
  };
  const providerReference = stringOrNull(value.providerReference, "providerReference");
  return { version: 1, operationId, executionId, tool, target, observedAt, providerReference };
}

function parseCommunicationFacts(value: unknown): CommunicationReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("communication facts must be an object");
  const logicalResponseId = nonEmptyString(value.logicalResponseId, "facts.logicalResponseId");
  const messageId = nonEmptyString(value.messageId, "facts.messageId");
  const threadId = nonEmptyString(value.threadId, "facts.threadId");
  if (!isRecord(value.destination)) throw new ReceiptValidationError("facts.destination must be an object");
  const destination = {
    kind: oneOf(value.destination.kind, "facts.destination.kind", ["thread", "email"] as const),
    id: nonEmptyString(value.destination.id, "facts.destination.id"),
  };
  const contentSha256 = sha256Digest(value.contentSha256, "facts.contentSha256 must be a SHA-256 digest");
  const deliveryState = oneOf(
    value.deliveryState,
    "facts.deliveryState",
    ["accepted", "sent", "delivered", "unknown"] as const,
  );
  const providerMessageId = stringOrNull(value.providerMessageId, "facts.providerMessageId");
  return { logicalResponseId, messageId, threadId, destination, contentSha256, deliveryState, providerMessageId };
}

function parseInternalNoteFacts(value: unknown): InternalNoteReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("internal note facts must be an object");
  return {
    threadId: nonEmptyString(value.threadId, "facts.threadId"),
    messageId: nonEmptyString(value.messageId, "facts.messageId"),
    contentSha256: sha256Digest(value.contentSha256, "facts.contentSha256 must be a SHA-256 digest"),
  };
}

function parseThreadStatusFacts(value: unknown): ThreadStatusReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("thread status facts must be an object");
  return {
    threadId: nonEmptyString(value.threadId, "facts.threadId"),
    beforeStatus: nonEmptyString(value.beforeStatus, "facts.beforeStatus"),
    afterStatus: nonEmptyString(value.afterStatus, "facts.afterStatus"),
  };
}

function parseThreadTagFacts(value: unknown): ThreadTagReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("thread tag facts must be an object");
  const threadId = nonEmptyString(value.threadId, "facts.threadId");
  const beforeTag = stringOrNull(value.beforeTag, "facts.beforeTag");
  return { threadId, beforeTag, afterTag: nonEmptyString(value.afterTag, "facts.afterTag") };
}

function parseTicketSpamFacts(value: unknown): TicketSpamReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("ticket spam facts must be an object");
  const threadId = nonEmptyString(value.threadId, "facts.threadId");
  const beforeFilterState = nonEmptyString(value.beforeFilterState, "facts.beforeFilterState");
  if (value.afterFilterState !== "filtered") {
    throw new ReceiptValidationError("facts.afterFilterState must be filtered");
  }
  return {
    threadId,
    beforeFilterState,
    afterFilterState: "filtered",
    decidedAt: isoTimestamp(value.decidedAt, "facts.decidedAt"),
  };
}

function parseVariantPriceFacts(value: unknown): VariantPriceReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("variant price facts must be an object");
  if (value.currency !== null && (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency))) {
    throw new ReceiptValidationError("facts.currency must be a three-letter uppercase code or null");
  }
  const currency = value.currency;
  const products = new Set<string>();
  const variants = new Set<string>();
  const batches = nonEmptyArray(value.batches, "facts.batches must be a non-empty array")
    .map((candidate, batchIndex): VariantPriceReceiptBatchV1 => {
      if (!isRecord(candidate)) {
        throw new ReceiptValidationError(`facts.batches[${batchIndex}] must be an object`);
      }
      const productId = nonEmptyString(candidate.productId, `facts.batches[${batchIndex}].productId`);
      if (products.has(productId)) {
        throw new ReceiptValidationError("facts.batches product IDs must be unique");
      }
      products.add(productId);
      const outcome = oneOf(
        candidate.outcome,
        `facts.batches[${batchIndex}].outcome`,
        ["succeeded", "failed", "unknown"] as const,
      );
      const confirmation = oneOf(candidate.confirmation, `facts.batches[${batchIndex}].confirmation`, [
        "mutation_response", "read_after_ambiguous_response", "provider_rejected", "not_attempted",
      ] as const);
      const changes = nonEmptyArray(candidate.changes, `facts.batches[${batchIndex}].changes must be a non-empty array`)
        .map((change, changeIndex): VariantPriceReceiptChangeV1 => {
          const field = `facts.batches[${batchIndex}].changes[${changeIndex}]`;
          if (!isRecord(change)) throw new ReceiptValidationError(`${field} must be an object`);
          const changeProductId = nonEmptyString(change.productId, `${field}.productId`);
          const variantId = nonEmptyString(change.variantId, `${field}.variantId`);
          if (changeProductId !== productId) {
            throw new ReceiptValidationError("variant price change product must match its batch");
          }
          if (variants.has(variantId)) {
            throw new ReceiptValidationError("variant price receipt variants must be unique");
          }
          variants.add(variantId);
          const originalPrice = moneyDecimal(change.originalPrice, `${field}.originalPrice`);
          const requestedPrice = moneyDecimal(change.requestedPrice, `${field}.requestedPrice`);
          const observedPrice = change.observedPrice === null
            ? null
            : moneyDecimal(change.observedPrice, `${field}.observedPrice`);
          if (outcome === "succeeded" && observedPrice !== requestedPrice) {
            throw new ReceiptValidationError("successful variant price changes must observe the requested price");
          }
          return { productId: changeProductId, variantId, originalPrice, requestedPrice, observedPrice };
        });
      return { productId, outcome, confirmation, changes };
    });
  return { currency, batches };
}

function parseEndFlashSaleFacts(value: unknown): EndFlashSaleReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("ended flash sale facts must be an object");
  return {
    flashSaleId: nonEmptyString(value.flashSaleId, "facts.flashSaleId"),
    confirmation: oneOf(
      value.confirmation,
      "facts.confirmation",
      ["deleted", "absent_after_ambiguous_response"] as const,
    ),
  };
}

function parseFlashSaleFacts(value: unknown): FlashSaleReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("flash sale facts must be an object");
  const flashSaleId = nonEmptyString(value.flashSaleId, "facts.flashSaleId");
  const appliesTo = oneOf(value.appliesTo, "facts.appliesTo", ["entire_catalog", "variants"] as const);
  if (!Array.isArray(value.variantIds)) {
    throw new ReceiptValidationError("facts.variantIds must be an array");
  }
  const seen = new Set<string>();
  const variantIds = value.variantIds.map((candidate, index) => {
    const variantId = nonEmptyString(candidate, `facts.variantIds[${index}]`);
    if (seen.has(variantId)) {
      throw new ReceiptValidationError("facts.variantIds must be unique");
    }
    seen.add(variantId);
    return variantId;
  });
  if (appliesTo === "entire_catalog" && variantIds.length !== 0) {
    throw new ReceiptValidationError("catalog flash sale facts cannot name variants");
  }
  if (appliesTo === "variants" && variantIds.length === 0) {
    throw new ReceiptValidationError("variant flash sale facts require variants");
  }
  const discountPercentage = positiveDecimal(value.discountPercentage, "facts.discountPercentage");
  if (Number(discountPercentage) > 100) {
    throw new ReceiptValidationError("facts.discountPercentage cannot exceed 100");
  }
  const startsAt = isoTimestamp(value.startsAt, "facts.startsAt");
  const endsAt = isoTimestamp(value.endsAt, "facts.endsAt");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new ReceiptValidationError("facts.endsAt must be after facts.startsAt");
  }
  const providerStatus = nonEmptyString(value.providerStatus, "facts.providerStatus");
  return { flashSaleId, appliesTo, variantIds, discountPercentage, startsAt, endsAt, providerStatus };
}

function parseGiftCardFacts(value: unknown): GiftCardReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("gift card facts must be an object");
  const giftCardId = nonEmptyString(value.giftCardId, "facts.giftCardId");
  const customerId = nonEmptyString(value.customerId, "facts.customerId");
  const amount = positiveDecimal(value.amount, "facts.amount");
  const currency = currencyCode(value.currency, "facts.currency");
  const codeSha256 = sha256Digest(value.codeSha256, "facts.codeSha256 must be a SHA-256 digest");
  if (typeof value.lastCharacters !== "string" || !/^[a-z0-9]{4}$/i.test(value.lastCharacters)) {
    throw new ReceiptValidationError("facts.lastCharacters must be four alphanumeric characters");
  }
  const lastCharacters = value.lastCharacters;
  if (value.expiresOn !== null && (typeof value.expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.expiresOn))) {
    throw new ReceiptValidationError("facts.expiresOn must be an ISO date or null");
  }
  const expiresOn = value.expiresOn;
  if (value.notificationRequested !== true) {
    throw new ReceiptValidationError("facts.notificationRequested must be true");
  }
  return {
    giftCardId, customerId, amount, currency, codeSha256, lastCharacters, expiresOn,
    notificationRequested: true,
  };
}

function parseCustomerNoteFacts(value: unknown): CustomerNoteReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("customer note facts must be an object");
  const customerId = nonEmptyString(value.customerId, "facts.customerId");
  const digest = (field: "previousNoteSha256" | "appendedNoteSha256" | "resultingNoteSha256") =>
    sha256Digest(value[field], `facts.${field} must be a SHA-256 digest`);
  const previousNoteSha256 = digest("previousNoteSha256");
  const appendedNoteSha256 = digest("appendedNoteSha256");
  const resultingNoteSha256 = digest("resultingNoteSha256");
  const resultingNoteLength = positiveInteger(value.resultingNoteLength, "facts.resultingNoteLength");
  if (value.appendState !== "appended") {
    throw new ReceiptValidationError("facts.appendState must be appended");
  }
  return {
    customerId, previousNoteSha256, appendedNoteSha256, resultingNoteSha256, resultingNoteLength,
    appendState: "appended",
  };
}

const CUSTOMER_INFO_FIELDS: readonly CustomerInfoReceiptFieldV1[] = ["firstName", "lastName", "email", "phone"];

function parseCustomerInfoFacts(value: unknown): CustomerInfoReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("customer info facts must be an object");
  const customerId = nonEmptyString(value.customerId, "facts.customerId");
  const seen = new Set<CustomerInfoReceiptFieldV1>();
  const updates = nonEmptyArray(value.updates, "customer info facts require updates").map((update, index) => {
    const field = `facts.updates[${index}]`;
    const updateField = isRecord(update) ? CUSTOMER_INFO_FIELDS.find(name => name === update.field) : undefined;
    if (!isRecord(update) || updateField === undefined) {
      throw new ReceiptValidationError(`${field}.field is invalid`);
    }
    if (seen.has(updateField)) throw new ReceiptValidationError(`${field}.field must be unique`);
    seen.add(updateField);
    return { field: updateField, value: nonEmptyString(update.value, `${field}.value`) };
  });
  return { customerId, updates };
}

function parseOrderCreationFacts(value: unknown): OrderCreationReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("order creation facts must be an object");
  const orderId = nonEmptyString(value.orderId, "facts.orderId");
  const orderName = nonEmptyString(value.orderName, "facts.orderName");
  const operationTag = nonEmptyString(value.operationTag, "facts.operationTag");
  if (!/^shopkeeper-op-[a-f0-9]{24}$/.test(operationTag)) {
    throw new ReceiptValidationError("facts.operationTag must be a deterministic Shopkeeper operation tag");
  }
  const financialStatus = nonEmptyString(value.financialStatus, "facts.financialStatus");
  const adminUrl = nonEmptyString(value.adminUrl, "facts.adminUrl");
  let parsedAdminUrl: URL;
  try {
    parsedAdminUrl = new URL(adminUrl);
  } catch {
    throw new ReceiptValidationError("facts.adminUrl must be a valid URL");
  }
  if (parsedAdminUrl.protocol !== "https:" || !parsedAdminUrl.pathname.endsWith(`/admin/orders/${orderId}`)) {
    throw new ReceiptValidationError("facts.adminUrl must identify the created order");
  }
  const totalAmount = nonEmptyString(value.totalAmount, "facts.totalAmount");
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(totalAmount)) {
    throw new ReceiptValidationError("facts.totalAmount must be a non-negative exact decimal string");
  }
  const currency = currencyCode(value.currency, "facts.currency");
  return { orderId, orderName, operationTag, financialStatus, adminUrl, totalAmount, currency };
}

function parseOrderEditFacts(
  value: unknown,
  options: { requireCommitted: boolean },
): OrderEditReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("order edit facts must be an object");
  const orderId = nonEmptyString(value.orderId, "facts.orderId");
  const changes = nonEmptyArray(value.changes, "order edit facts require changes")
    .map((change, index): OrderEditReceiptChangeV1 => {
      const field = `facts.changes[${index}]`;
      if (!isRecord(change)) throw new ReceiptValidationError(`${field} must be an object`);
      const kind = oneOf(change.kind, `${field}.kind`, ["addition", "removal"] as const);
      const variantId = nonEmptyString(change.variantId, `${field}.variantId`);
      const lineItemId = optionalNonEmptyString(change.lineItemId, `${field}.lineItemId`);
      let requestedQuantity: number | null;
      if (kind === "addition") {
        requestedQuantity = positiveInteger(change.requestedQuantity, `${field}.requestedQuantity`);
      } else if (change.requestedQuantity !== null) {
        throw new ReceiptValidationError(`${field}.requestedQuantity must be null for a removal`);
      } else {
        requestedQuantity = null;
      }
      const observed = change.providerObservedFinalQuantity;
      if (observed !== null && (!Number.isSafeInteger(observed) || Number(observed) < 0)) {
        throw new ReceiptValidationError(
          `${field}.providerObservedFinalQuantity must be a non-negative integer or null`,
        );
      }
      const providerObservedFinalQuantity = observed === null ? null : observed as number;
      const outcome = oneOf(
        change.outcome,
        `${field}.outcome`,
        ["committed", "staged", "rejected", "unknown"] as const,
      );
      if (options.requireCommitted && (outcome !== "committed" || providerObservedFinalQuantity === null)) {
        throw new ReceiptValidationError(
          `${field} must be committed with a provider-observed final quantity`,
        );
      }
      return { kind, variantId, lineItemId, requestedQuantity, providerObservedFinalQuantity, outcome };
    });
  return { orderId, changes };
}

function parseAddress(value: unknown, field: string): AddressReceiptAddressV1 {
  if (!isRecord(value)) throw new ReceiptValidationError(`${field} must be an object`);
  const required = (key: "address1" | "city" | "province" | "postalCode" | "country") =>
    nonEmptyString(value[key], `${field}.${key}`);
  const optional = (key: "firstName" | "lastName" | "address2" | "provinceCode" | "countryCode") =>
    optionalNonEmptyString(value[key], `${field}.${key}`);
  const address1 = required("address1");
  const city = required("city");
  const province = required("province");
  const postalCode = required("postalCode");
  const country = required("country");
  return {
    firstName: optional("firstName"),
    lastName: optional("lastName"),
    address1,
    address2: optional("address2"),
    city,
    province,
    provinceCode: optional("provinceCode"),
    postalCode,
    country,
    countryCode: optional("countryCode"),
  };
}

function parseOrderAddressFacts(value: unknown): OrderAddressReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("order address facts must be an object");
  const orderId = nonEmptyString(value.orderId, "facts.orderId");
  const customerId = nonEmptyString(value.customerId, "facts.customerId");
  if (!isRecord(value.orderAddress)) {
    throw new ReceiptValidationError("facts.orderAddress must be an object");
  }
  const orderOutcome = value.orderAddress.outcome;
  if (orderOutcome !== "updated" && orderOutcome !== "already_matched") {
    throw new ReceiptValidationError("facts.orderAddress.outcome is invalid");
  }
  const orderAddress: OrderAddressReceiptFactsV1["orderAddress"] = {
    outcome: orderOutcome,
    address: parseAddress(value.orderAddress.address, "facts.orderAddress.address"),
  };
  if (!isRecord(value.customerDefaultAddress)) {
    throw new ReceiptValidationError("facts.customerDefaultAddress must be an object");
  }
  const customer = value.customerDefaultAddress;
  let customerDefaultAddress: OrderAddressReceiptFactsV1["customerDefaultAddress"];
  if (customer.outcome === "updated" || customer.outcome === "already_matched") {
    customerDefaultAddress = {
      outcome: customer.outcome,
      addressId: nonEmptyString(customer.addressId, "facts.customerDefaultAddress.addressId"),
      address: parseAddress(customer.address, "facts.customerDefaultAddress.address"),
    };
  } else if (customer.outcome === "not_updated") {
    if (customer.code !== "no_default_address") {
      throw new ReceiptValidationError("facts.customerDefaultAddress.code is invalid");
    }
    customerDefaultAddress = { outcome: "not_updated", code: "no_default_address" };
  } else if (customer.outcome === "failed" || customer.outcome === "unknown") {
    customerDefaultAddress = {
      outcome: customer.outcome,
      code: nonEmptyString(customer.code, "facts.customerDefaultAddress.code"),
    };
  } else {
    throw new ReceiptValidationError("facts.customerDefaultAddress.outcome is invalid");
  }
  return { orderId, customerId, orderAddress, customerDefaultAddress };
}

function parseFulfillmentFacts(value: unknown): FulfillmentReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("fulfillment facts must be an object");
  const orderId = nonEmptyString(value.orderId, "facts.orderId");
  const fulfillmentId = nonEmptyString(value.fulfillmentId, "facts.fulfillmentId");
  const status = nonEmptyString(value.status, "facts.status");
  const fulfilledAt = isoTimestamp(value.fulfilledAt, "facts.fulfilledAt");
  const lineItems = nonEmptyArray(value.lineItems, "fulfillment facts require line items").map((item, index) => {
    if (!isRecord(item)) {
      throw new ReceiptValidationError(`facts.lineItems[${index}] must be an object`);
    }
    return {
      fulfillmentLineItemId: nonEmptyString(
        item.fulfillmentLineItemId,
        `facts.lineItems[${index}].fulfillmentLineItemId`,
      ),
      lineItemId: nonEmptyString(item.lineItemId, `facts.lineItems[${index}].lineItemId`),
      quantity: positiveInteger(item.quantity, `facts.lineItems[${index}].quantity`),
    };
  });
  if (!isRecord(value.tracking)) {
    throw new ReceiptValidationError("facts.tracking must be an object");
  }
  const trackingField = (field: "number" | "company" | "url", tracking: Record<string, unknown>) =>
    optionalNonEmptyString(tracking[field], `facts.tracking.${field}`);
  const tracking = {
    number: trackingField("number", value.tracking),
    company: trackingField("company", value.tracking),
    url: trackingField("url", value.tracking),
  };
  if (typeof value.notifyCustomerRequested !== "boolean") {
    throw new ReceiptValidationError("facts.notifyCustomerRequested must be a boolean");
  }
  return {
    orderId, fulfillmentId, status, fulfilledAt, lineItems, tracking,
    notifyCustomerRequested: value.notifyCustomerRequested,
  };
}

function parseReturnLabelFacts(value: unknown): ReturnLabelReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("return label facts must be an object");
  const orderId = nonEmptyString(value.orderId, "facts.orderId");
  const returnId = nonEmptyString(value.returnId, "facts.returnId");
  const reverseFulfillmentOrderId = nonEmptyString(value.reverseFulfillmentOrderId, "facts.reverseFulfillmentOrderId");
  const reverseDeliveryId = nonEmptyString(value.reverseDeliveryId, "facts.reverseDeliveryId");
  const labelSha256 = sha256Digest(value.labelSha256, "facts.labelSha256 must be a lowercase SHA-256 digest");
  const trackingNumber = optionalNonEmptyString(value.trackingNumber, "facts.trackingNumber");
  if (value.attachmentState !== "attached") {
    throw new ReceiptValidationError("facts.attachmentState must be attached");
  }
  return {
    orderId, returnId, reverseFulfillmentOrderId, reverseDeliveryId, labelSha256, trackingNumber,
    attachmentState: "attached",
  };
}

function parseReturnFacts(value: unknown): ReturnReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("return facts must be an object");
  const orderId = nonEmptyString(value.orderId, "facts.orderId");
  const returnId = nonEmptyString(value.returnId, "facts.returnId");
  const returnName = nonEmptyString(value.returnName, "facts.returnName");
  const status = nonEmptyString(value.status, "facts.status");
  const lineItems = nonEmptyArray(value.lineItems, "return facts require line items").map((line, index) => {
    if (!isRecord(line)) throw new ReceiptValidationError(`facts.lineItems[${index}] must be an object`);
    return {
      fulfillmentLineItemId: nonEmptyString(
        line.fulfillmentLineItemId,
        `facts.lineItems[${index}].fulfillmentLineItemId`,
      ),
      quantity: positiveInteger(line.quantity, `facts.lineItems[${index}].quantity`),
    };
  });
  if (value.refundIssued !== false) {
    throw new ReceiptValidationError("facts.refundIssued must be false");
  }
  return { orderId, returnId, returnName, status, lineItems, refundIssued: false };
}

function parseExchangeFacts(value: unknown): ExchangeReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("exchange facts must be an object");
  const orderId = nonEmptyString(value.orderId, "facts.orderId");
  const returnId = nonEmptyString(value.returnId, "facts.returnId");
  const returnName = nonEmptyString(value.returnName, "facts.returnName");
  const status = nonEmptyString(value.status, "facts.status");
  const returnedItems = nonEmptyArray(value.returnedItems, "exchange facts require returned items")
    .map((item, index) => {
      if (!isRecord(item)) throw new ReceiptValidationError(`facts.returnedItems[${index}] must be an object`);
      return {
        variantId: nonEmptyString(item.variantId, `facts.returnedItems[${index}].variantId`),
        fulfillmentLineItemId: nonEmptyString(
          item.fulfillmentLineItemId,
          `facts.returnedItems[${index}].fulfillmentLineItemId`,
        ),
        quantity: positiveInteger(item.quantity, `facts.returnedItems[${index}].quantity`),
      };
    });
  const replacementItems = nonEmptyArray(value.replacementItems, "exchange facts require replacement items")
    .map((item, index) => {
      if (!isRecord(item)) throw new ReceiptValidationError(`facts.replacementItems[${index}] must be an object`);
      return {
        variantId: nonEmptyString(item.variantId, `facts.replacementItems[${index}].variantId`),
        quantity: positiveInteger(item.quantity, `facts.replacementItems[${index}].quantity`),
      };
    });
  let financialConsequence: ExchangeReceiptFactsV1["financialConsequence"] = null;
  if (value.financialConsequence !== null) {
    if (!isRecord(value.financialConsequence)) {
      throw new ReceiptValidationError("facts.financialConsequence must be an object or null");
    }
    const kind = value.financialConsequence.kind;
    if (kind !== "refund" && kind !== "charge") {
      throw new ReceiptValidationError("facts.financialConsequence.kind must be refund or charge");
    }
    financialConsequence = {
      kind,
      amount: positiveDecimal(value.financialConsequence.amount, "facts.financialConsequence.amount"),
      currency: currencyCode(value.financialConsequence.currency, "facts.financialConsequence.currency"),
    };
  }
  return { orderId, returnId, returnName, status, returnedItems, replacementItems, financialConsequence };
}

/** The fields every refund receipt carries; `classification` is checked by the caller. */
function refundBase(value: Record<string, unknown>): Omit<RefundReceiptFactsV1, "classification"> {
  return {
    orderId: nonEmptyString(value.orderId, "facts.orderId"),
    refundId: nonEmptyString(value.refundId, "facts.refundId"),
    amount: positiveDecimal(value.amount, "facts.amount"),
    currency: currencyCode(value.currency, "facts.currency"),
    transactionStatus: nonEmptyString(value.transactionStatus, "facts.transactionStatus"),
    transactionReference: nonEmptyString(value.transactionReference, "facts.transactionReference"),
  };
}

function parseRefundFacts(value: unknown): RefundReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("refund facts must be an object");
  const base = refundBase(value);
  if (value.classification !== "full" && value.classification !== "partial") {
    throw new ReceiptValidationError("facts.classification must be full or partial");
  }
  return { ...base, classification: value.classification };
}

function parsePartialRefundFacts(value: unknown): PartialRefundReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("refund facts must be an object");
  const base = refundBase(value);
  if (value.classification !== "partial" || !Array.isArray(value.lineItems) || value.lineItems.length === 0) {
    throw new ReceiptValidationError("partial refund facts require partial classification and line items");
  }
  const lineItems = value.lineItems.map((line, index) => {
    if (!isRecord(line)) throw new ReceiptValidationError(`facts.lineItems[${index}] must be an object`);
    return {
      lineItemId: nonEmptyString(line.lineItemId, `facts.lineItems[${index}].lineItemId`),
      quantity: positiveInteger(line.quantity, `facts.lineItems[${index}].quantity`),
    };
  });
  return { ...base, classification: "partial", lineItems };
}

function parseCancellationFacts(value: unknown): CancellationReceiptFactsV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("cancellation facts must be an object");
  const facts: CancellationReceiptFactsV1 = {
    orderId: nonEmptyString(value.orderId, "facts.orderId"),
    cancelledAt: isoTimestamp(value.cancelledAt, "facts.cancelledAt"),
    reason: nonEmptyString(value.reason, "facts.reason"),
    financialStatus: nonEmptyString(value.financialStatus, "facts.financialStatus"),
    restockResult: stringOrNull(value.restockResult, "facts.restockResult"),
  };
  // Absent on receipts written before cancellations refunded; kept absent.
  if (value.refund === null) {
    facts.refund = null;
  } else if (value.refund !== undefined) {
    if (!isRecord(value.refund)) throw new ReceiptValidationError("facts.refund must be an object or null");
    facts.refund = {
      amount: moneyDecimal(value.refund.amount, "facts.refund.amount"),
      currency: currencyCode(value.refund.currency, "facts.refund.currency"),
    };
  }
  return facts;
}

type ReceiptValidator<Facts> = (base: ReceiptBaseV1, value: Record<string, unknown>) => Facts;
interface ReceiptContract<Facts> {
  targetKind: string;
  failureTargets?: readonly string[];
  succeeded: ReceiptValidator<Facts>;
  partial?: { label: string; validate: ReceiptValidator<Facts> };
}

/** Shared identity checks; each fact parser still owns its domain invariants. */
function factIdentity<Facts extends object>(
  parse: (value: unknown) => Facts,
  label: string,
  targetKey: keyof Facts | null,
  providerKey?: keyof Facts,
): ReceiptValidator<Facts> {
  return (base, value) => {
    if (providerKey) nonEmptyString(value.providerReference, "providerReference");
    const facts = parse(value.facts);
    if (targetKey && base.target.id !== facts[targetKey]) {
      throw new ReceiptValidationError(`${label} target must match facts.${String(targetKey)}`);
    }
    if (providerKey && value.providerReference !== facts[providerKey]) {
      throw new ReceiptValidationError(`${label} providerReference must match facts.${String(providerKey)}`);
    }
    return facts;
  };
}

function threadStateIdentity<Facts extends { threadId: string }>(
  parse: (value: unknown) => Facts,
  label: string,
): ReceiptValidator<Facts> {
  return (base, value) => {
    nonEmptyString(value.providerReference, "providerReference");
    const facts = parse(value.facts);
    if (base.target.id !== facts.threadId || value.providerReference !== facts.threadId) {
      throw new ReceiptValidationError(`${label} identities must match the target thread`);
    }
    return facts;
  };
}

function validateCommunication(base: ReceiptBaseV1, value: Record<string, unknown>): CommunicationReceiptFactsV1 {
  nonEmptyString(value.providerReference, "providerReference");
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
  return facts;
}

function validateVariantPriceReceipt(base: ReceiptBaseV1, value: Record<string, unknown>): VariantPriceReceiptFactsV1 {
  nonEmptyString(value.providerReference, "providerReference");
  if (value.providerReference !== base.target.id) {
    throw new ReceiptValidationError("variant price providerReference must match the shop target");
  }
  const facts = parseVariantPriceFacts(value.facts);
  if (value.outcome === "succeeded" && facts.batches.some(batch => batch.outcome !== "succeeded")) {
    throw new ReceiptValidationError("successful variant price receipts require successful batches");
  }
  return facts;
}

const validateOrderAddressReceipt = factIdentity(parseOrderAddressFacts, "order address", "orderId", "orderId");
const communicationContract: ReceiptContract<CommunicationReceiptFactsV1> = {
  targetKind: "thread",
  succeeded: validateCommunication,
  partial: { label: "communication", validate: validateCommunication },
};

// Adding a receipt tool requires a complete success/failure contract here, and
// its validator must return that tool's facts: the map is keyed by the same
// tools as the facts types, so neither can silently be absent or mistyped.
const RECEIPT_CONTRACTS: { [Tool in ReceiptToolV1]: ReceiptContract<ReceiptFactsByToolV1[Tool]> } = {
  create_refund: { targetKind: "order", succeeded: factIdentity(parseRefundFacts, "refund", "orderId", "refundId") },
  create_partial_refund: { targetKind: "order", succeeded: factIdentity(parsePartialRefundFacts, "refund", "orderId", "refundId") },
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

function isReceiptTool(tool: string): tool is ReceiptToolV1 {
  return Object.hasOwn(RECEIPT_CONTRACTS, tool);
}

const FAILURE_OUTCOMES = ["not_found", "rejected", "failed", "unknown"] as const;

/**
 * A receipt rebuilt from the fields its contract checked. Each field is read
 * through a validator, so nothing the provider path did not establish reaches
 * the action log. The one remaining cast pairs a tool with its facts type,
 * which `RECEIPT_CONTRACTS` already enforces by construction.
 */
export function parseReceiptV1(value: unknown): ReceiptV1 {
  if (!isRecord(value)) throw new ReceiptValidationError("receipt must be an object");
  const base = parseBaseReceipt(value);
  if (!isReceiptTool(base.tool)) {
    throw new ReceiptValidationError(`no receipt validator is registered for ${base.tool}`);
  }
  const contract: ReceiptContract<unknown> = RECEIPT_CONTRACTS[base.tool];
  const succeeded = value.outcome === "succeeded";
  const targets = succeeded ? [contract.targetKind] : contract.failureTargets ?? [contract.targetKind];
  if (!targets.includes(base.target.kind)) {
    const article = targets[0] === "order" ? "an" : "a";
    throw new ReceiptValidationError(`${base.tool} receipt target must be ${article} ${targets.join(" or ")}`);
  }
  if (succeeded) {
    const facts = contract.succeeded(base, value);
    return { ...base, outcome: "succeeded", facts } as ReceiptV1;
  }
  const outcome = FAILURE_OUTCOMES.find(candidate => candidate === value.outcome);
  if (outcome === undefined) throw new ReceiptValidationError("receipt outcome is invalid");
  const code = nonEmptyString(value.code, "code");
  if (value.facts === undefined) return { ...base, outcome, code } as ReceiptV1;
  if (!contract.partial) throw new ReceiptValidationError("failure receipt facts are not supported for this tool");
  if (outcome !== "unknown") {
    throw new ReceiptValidationError(`${contract.partial.label} facts require an unknown outcome`);
  }
  const facts = contract.partial.validate(base, value);
  return { ...base, outcome, code, facts } as ReceiptV1;
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
