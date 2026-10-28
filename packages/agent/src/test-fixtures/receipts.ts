// One valid ReceiptV1 per tool, for the receipt validation suites to vary.
import type { ReceiptV1 } from "../tools/result.js";

export function refundReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-1",
    executionId: "execution-1",
    tool: "create_refund",
    target: { kind: "order", id: "gid://shopify/Order/1" },
    observedAt: "2026-09-12T07:00:00.000Z",
    outcome: "succeeded",
    providerReference: "gid://shopify/Refund/2",
    facts: {
      orderId: "gid://shopify/Order/1",
      refundId: "gid://shopify/Refund/2",
      amount: "40.00",
      currency: "USD",
      transactionStatus: "SUCCESS",
      transactionReference: "txn-3",
      classification: "partial",
    },
    ...overrides,
  } as ReceiptV1;
}

export function returnReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-return-1",
    executionId: "execution-return-1",
    tool: "create_return",
    target: { kind: "order", id: "2001" },
    observedAt: "2026-09-12T07:00:00.000Z",
    outcome: "succeeded",
    providerReference: "gid://shopify/Return/999",
    facts: {
      orderId: "2001",
      returnId: "gid://shopify/Return/999",
      returnName: "#2001-R1",
      status: "REQUESTED",
      lineItems: [{ fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/321", quantity: 1 }],
      refundIssued: false,
    },
    ...overrides,
  } as ReceiptV1;
}

export function exchangeReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-exchange-1",
    executionId: "execution-exchange-1",
    tool: "create_exchange",
    target: { kind: "order", id: "2001" },
    observedAt: "2026-09-12T07:00:00.000Z",
    outcome: "succeeded",
    providerReference: "gid://shopify/Return/999",
    facts: {
      orderId: "2001",
      returnId: "gid://shopify/Return/999",
      returnName: "#2001-R1",
      status: "REQUESTED",
      returnedItems: [{
        variantId: "gid://shopify/ProductVariant/10",
        fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/321",
        quantity: 1,
      }],
      replacementItems: [{ variantId: "gid://shopify/ProductVariant/11", quantity: 1 }],
      financialConsequence: null,
    },
    ...overrides,
  } as ReceiptV1;
}

export function returnLabelReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-label-1",
    executionId: "execution-label-1",
    tool: "attach_return_label",
    target: { kind: "order", id: "2001" },
    observedAt: "2026-09-12T07:00:00.000Z",
    outcome: "succeeded",
    providerReference: "gid://shopify/ReverseDelivery/777",
    facts: {
      orderId: "2001",
      returnId: "gid://shopify/Return/999",
      reverseFulfillmentOrderId: "gid://shopify/ReverseFulfillmentOrder/555",
      reverseDeliveryId: "gid://shopify/ReverseDelivery/777",
      labelSha256: "a".repeat(64),
      trackingNumber: "1Z999",
      attachmentState: "attached",
    },
    ...overrides,
  } as ReceiptV1;
}

export function fulfillmentReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-fulfillment-1",
    executionId: "execution-fulfillment-1",
    tool: "fulfill_order",
    target: { kind: "order", id: "2001" },
    observedAt: "2026-09-12T07:00:00.000Z",
    outcome: "succeeded",
    providerReference: "gid://shopify/Fulfillment/444",
    facts: {
      orderId: "2001",
      fulfillmentId: "gid://shopify/Fulfillment/444",
      status: "SUCCESS",
      fulfilledAt: "2026-09-12T06:59:59.000Z",
      lineItems: [{
        fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/501",
        lineItemId: "gid://shopify/LineItem/601",
        quantity: 2,
      }],
      tracking: { number: "1Z999", company: "UPS", url: null },
      notifyCustomerRequested: true,
    },
    ...overrides,
  } as ReceiptV1;
}

export const ADDRESS = {
  firstName: "Ada",
  lastName: "Lovelace",
  address1: "123 Main St",
  address2: null,
  city: "Los Angeles",
  province: "California",
  provinceCode: "CA",
  postalCode: "90001",
  country: "United States",
  countryCode: "US",
};

export function orderAddressReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-address-1",
    executionId: "execution-address-1",
    tool: "update_shopify_order_address",
    target: { kind: "order", id: "3001" },
    observedAt: "2026-09-12T08:00:00.000Z",
    outcome: "succeeded",
    providerReference: "3001",
    facts: {
      orderId: "3001",
      customerId: "900",
      orderAddress: { outcome: "updated", address: ADDRESS },
      customerDefaultAddress: { outcome: "updated", addressId: "789", address: ADDRESS },
    },
    ...overrides,
  } as ReceiptV1;
}

export function orderEditReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-edit-1",
    executionId: "execution-edit-1",
    tool: "edit_shopify_order",
    target: { kind: "order", id: "3001" },
    observedAt: "2026-09-12T08:00:00.000Z",
    outcome: "succeeded",
    providerReference: "3001",
    facts: {
      orderId: "3001",
      changes: [{
        kind: "addition",
        variantId: "gid://shopify/ProductVariant/44",
        lineItemId: "gid://shopify/LineItem/55",
        requestedQuantity: 2,
        providerObservedFinalQuantity: 3,
        outcome: "committed",
      }],
    },
    ...overrides,
  } as ReceiptV1;
}

export function orderCreationReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-create-order-1",
    executionId: "execution-create-order-1",
    tool: "create_shopify_order",
    target: { kind: "order", id: "4001" },
    observedAt: "2026-09-12T08:00:00.000Z",
    outcome: "succeeded",
    providerReference: "4001",
    facts: {
      orderId: "4001",
      orderName: "#1042",
      operationTag: "shopkeeper-op-123456789012345678901234",
      financialStatus: "pending",
      adminUrl: "https://test-store.myshopify.com/admin/orders/4001",
      totalAmount: "25.00",
      currency: "USD",
    },
    ...overrides,
  } as ReceiptV1;
}

export function customerInfoReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-customer-info-1",
    executionId: "execution-customer-info-1",
    tool: "update_shopify_customer_info",
    target: { kind: "customer", id: "9001" },
    observedAt: "2026-09-13T08:00:00.000Z",
    outcome: "succeeded",
    providerReference: "9001",
    facts: {
      customerId: "9001",
      updates: [
        { field: "firstName", value: "Jane" },
        { field: "email", value: "jane@example.com" },
      ],
    },
    ...overrides,
  } as ReceiptV1;
}

export function customerNoteReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-customer-note-1",
    executionId: "execution-customer-note-1",
    tool: "add_shopify_customer_note",
    target: { kind: "customer", id: "9001" },
    observedAt: "2026-09-13T08:00:00.000Z",
    outcome: "succeeded",
    providerReference: "9001",
    facts: {
      customerId: "9001",
      previousNoteSha256: "a".repeat(64),
      appendedNoteSha256: "b".repeat(64),
      resultingNoteSha256: "c".repeat(64),
      resultingNoteLength: 42,
      appendState: "appended",
    },
    ...overrides,
  } as ReceiptV1;
}

export function giftCardReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-gift-card-1",
    executionId: "execution-gift-card-1",
    tool: "create_gift_card",
    target: { kind: "customer", id: "9001" },
    observedAt: "2026-09-13T08:00:00.000Z",
    outcome: "succeeded",
    providerReference: "gid://shopify/GiftCard/42",
    facts: {
      giftCardId: "gid://shopify/GiftCard/42",
      customerId: "9001",
      amount: "25.00",
      currency: "USD",
      codeSha256: "d".repeat(64),
      lastCharacters: "a1b2",
      expiresOn: null,
      notificationRequested: true,
    },
    ...overrides,
  } as ReceiptV1;
}

export function flashSaleReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-flash-sale-1",
    executionId: "execution-flash-sale-1",
    tool: "create_flash_sale",
    target: { kind: "shop", id: "test-store.myshopify.com" },
    observedAt: "2026-09-13T08:00:00.000Z",
    outcome: "succeeded",
    providerReference: "gid://shopify/DiscountAutomaticNode/42",
    facts: {
      flashSaleId: "gid://shopify/DiscountAutomaticNode/42",
      appliesTo: "variants",
      variantIds: ["gid://shopify/ProductVariant/7"],
      discountPercentage: "20",
      startsAt: "2026-09-13T08:00:00.000Z",
      endsAt: "2026-09-14T08:00:00.000Z",
      providerStatus: "ACTIVE",
    },
    ...overrides,
  } as ReceiptV1;
}

export function endFlashSaleReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-end-flash-sale-1",
    executionId: "execution-end-flash-sale-1",
    tool: "end_flash_sale",
    target: { kind: "discount", id: "gid://shopify/DiscountAutomaticNode/42" },
    observedAt: "2026-09-14T08:00:00.000Z",
    outcome: "succeeded",
    providerReference: "gid://shopify/DiscountAutomaticNode/42",
    facts: {
      flashSaleId: "gid://shopify/DiscountAutomaticNode/42",
      confirmation: "deleted",
    },
    ...overrides,
  } as ReceiptV1;
}

export function variantPriceReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-reprice-1",
    executionId: "execution-reprice-1",
    tool: "set_variant_prices",
    target: { kind: "shop", id: "test-store.myshopify.com" },
    observedAt: "2026-09-14T09:00:00.000Z",
    outcome: "succeeded",
    providerReference: "test-store.myshopify.com",
    facts: {
      currency: "USD",
      batches: [{
        productId: "gid://shopify/Product/1",
        outcome: "succeeded",
        confirmation: "mutation_response",
        changes: [{
          productId: "gid://shopify/Product/1",
          variantId: "gid://shopify/ProductVariant/1",
          originalPrice: "48.00",
          requestedPrice: "44.00",
          observedPrice: "44.00",
        }],
      }],
    },
    ...overrides,
  } as ReceiptV1;
}
