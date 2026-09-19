import { describe, expect, it } from "vitest";
import {
  parseReceiptV1,
  receiptAsUnknown,
  ReceiptValidationError,
  validateToolResultReceipt,
  type ReceiptV1,
} from "./result.js";

function refundReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function returnReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function exchangeReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function returnLabelReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function fulfillmentReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

const ADDRESS = {
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

function orderAddressReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function orderEditReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function orderCreationReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function customerInfoReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function customerNoteReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function giftCardReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function flashSaleReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function endFlashSaleReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

function variantPriceReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
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

describe("receipt v1", () => {
  it("validates exact refund facts independently of display text", () => {
    const receipt = refundReceipt();
    expect(validateToolResultReceipt({ status: "ok", message: "first wording", receipt })).toEqual(receipt);
    expect(validateToolResultReceipt({ status: "ok", message: "completely different wording", receipt })).toEqual(receipt);
  });

  it("validates created-order identity, financial state, and provider URL", () => {
    expect(() => parseReceiptV1(orderCreationReceipt())).not.toThrow();
    expect(() => parseReceiptV1(orderCreationReceipt({ providerReference: "different-order" })))
      .toThrow("providerReference");
    expect(() => parseReceiptV1(orderCreationReceipt({
      facts: {
        ...(orderCreationReceipt() as Extract<ReceiptV1, {
          tool: "create_shopify_order";
          outcome: "succeeded";
        }>).facts,
        adminUrl: "https://test-store.myshopify.com/admin/orders/other",
      } as never,
    }))).toThrow("adminUrl");
    expect(() => parseReceiptV1(orderCreationReceipt({
      facts: {
        ...(orderCreationReceipt() as Extract<ReceiptV1, {
          tool: "create_shopify_order";
          outcome: "succeeded";
        }>).facts,
        currency: "usd",
      } as never,
    }))).toThrow("facts.currency");
    expect(() => parseReceiptV1(orderCreationReceipt({
      facts: {
        ...(orderCreationReceipt() as Extract<ReceiptV1, {
          tool: "create_shopify_order";
          outcome: "succeeded";
        }>).facts,
        operationTag: "unbound-tag",
      } as never,
    }))).toThrow("facts.operationTag");
  });

  it("allows an order-creation failure to retain its email target", () => {
    expect(() => parseReceiptV1({
      version: 1,
      operationId: "operation-create-order-1",
      executionId: "execution-create-order-1",
      tool: "create_shopify_order",
      target: { kind: "email", id: "buyer@example.com" },
      observedAt: "2026-09-12T08:00:00.000Z",
      outcome: "unknown",
      code: "creation_not_confirmed",
      providerReference: null,
    })).not.toThrow();
  });

  it("validates customer-info facts and binds them to the customer", () => {
    expect(() => parseReceiptV1(customerInfoReceipt())).not.toThrow();
    expect(() => parseReceiptV1(customerInfoReceipt({ providerReference: "different" })))
      .toThrow("providerReference");
    expect(() => parseReceiptV1(customerInfoReceipt({ target: { kind: "order", id: "9001" } })))
      .toThrow("target must be a customer");
    expect(() => parseReceiptV1(customerInfoReceipt({
      facts: {
        customerId: "9001",
        updates: [
          { field: "email", value: "jane@example.com" },
          { field: "email", value: "duplicate@example.com" },
        ],
      },
    }))).toThrow("must be unique");
  });

  it("validates privacy-preserving customer-note hashes and target binding", () => {
    expect(() => parseReceiptV1(customerNoteReceipt())).not.toThrow();
    expect(() => parseReceiptV1(customerNoteReceipt({ providerReference: "different" })))
      .toThrow("providerReference");
    expect(() => parseReceiptV1(customerNoteReceipt({
      facts: {
        customerId: "9001",
        previousNoteSha256: "not-a-digest",
        appendedNoteSha256: "b".repeat(64),
        resultingNoteSha256: "c".repeat(64),
        resultingNoteLength: 42,
        appendState: "appended",
      },
    }))).toThrow("previousNoteSha256");
  });

  it("validates gift-card money, secret fingerprint, and provider identity", () => {
    expect(() => parseReceiptV1(giftCardReceipt())).not.toThrow();
    expect(() => parseReceiptV1(giftCardReceipt({ providerReference: "different" })))
      .toThrow("providerReference");
    expect(() => parseReceiptV1(giftCardReceipt({
      facts: {
        ...(giftCardReceipt() as Extract<ReceiptV1, {
          tool: "create_gift_card";
          outcome: "succeeded";
        }>).facts,
        currency: "usd",
      },
    }))).toThrow("facts.currency");
  });

  it("rejects imprecise money and invalid currency", () => {
    expect(() => parseReceiptV1(refundReceipt({
      facts: { ...(refundReceipt() as Extract<ReceiptV1, { outcome: "succeeded" }>).facts, amount: 40 } as never,
    }))).toThrow(ReceiptValidationError);
    expect(() => parseReceiptV1(refundReceipt({
      facts: { ...(refundReceipt() as Extract<ReceiptV1, { outcome: "succeeded" }>).facts, currency: "usd" } as never,
    }))).toThrow("facts.currency");
  });

  it("rejects a legacy status that disagrees with the receipt outcome", () => {
    expect(() => validateToolResultReceipt({
      status: "error",
      message: "optimistic or stale display status",
      receipt: refundReceipt(),
    })).toThrow("requires tool status ok");
  });

  it("binds the receipt to the invoked tool and runtime operation", () => {
    expect(() => validateToolResultReceipt(
      { status: "ok", message: "done", receipt: refundReceipt() },
      { tool: "cancel_order" },
    )).toThrow("does not match");
    expect(() => validateToolResultReceipt(
      { status: "ok", message: "done", receipt: refundReceipt() },
      { operationId: "operation-2" },
    )).toThrow("runtime operation");
    expect(() => validateToolResultReceipt(
      { status: "ok", message: "done", receipt: refundReceipt() },
      { executionId: "execution-2" },
    )).toThrow("runtime execution");
  });

  it("binds refund target and provider reference to observed facts", () => {
    expect(() => parseReceiptV1(refundReceipt({
      target: { kind: "order", id: "different-order" },
    }))).toThrow("target");
    expect(() => parseReceiptV1(refundReceipt({ providerReference: "different-refund" }))).toThrow(
      "providerReference",
    );
  });

  it("keeps not-found and unknown outcomes distinct", () => {
    const common = {
      version: 1 as const,
      operationId: "operation-1",
      executionId: "execution-1",
      tool: "cancel_order",
      target: { kind: "order", id: "1" },
      observedAt: "2026-09-12T07:00:00.000Z",
      providerReference: null,
      code: "provider_lookup_empty",
    };
    expect(validateToolResultReceipt({
      status: "not_found",
      message: "missing",
      receipt: { ...common, outcome: "not_found" },
    })?.outcome).toBe("not_found");
    expect(validateToolResultReceipt({
      status: "unknown",
      message: "timed out",
      receipt: { ...common, outcome: "unknown" },
    })?.outcome).toBe("unknown");
  });

  it("preserves operation identity when a later local failure makes success uncertain", () => {
    const receipt = receiptAsUnknown(refundReceipt(), "budget_record_persistence_failed");

    expect(receipt).toMatchObject({
      version: 1,
      operationId: "operation-1",
      executionId: "execution-1",
      tool: "create_refund",
      target: { kind: "order", id: "gid://shopify/Order/1" },
      providerReference: "gid://shopify/Refund/2",
      outcome: "unknown",
      code: "budget_record_persistence_failed",
    });
    expect("facts" in receipt).toBe(false);
    expect(() => parseReceiptV1(receipt)).not.toThrow();
  });

  it("requires cancellation state and never accepts refund-shaped cancellation facts", () => {
    expect(() => parseReceiptV1({
      ...refundReceipt(),
      tool: "cancel_order",
    })).toThrow("facts.cancelledAt");
  });

  it("validates observed return facts and binds them to the provider return", () => {
    expect(() => parseReceiptV1(returnReceipt())).not.toThrow();
    expect(() => parseReceiptV1(returnReceipt({ providerReference: "different-return" }))).toThrow(
      "providerReference",
    );
    expect(() => parseReceiptV1(returnReceipt({
      facts: {
        ...(returnReceipt() as Extract<ReceiptV1, { tool: "create_return"; outcome: "succeeded" }>).facts,
        refundIssued: true,
      } as never,
    }))).toThrow("refundIssued");
    expect(() => parseReceiptV1(returnReceipt({
      facts: {
        ...(returnReceipt() as Extract<ReceiptV1, { tool: "create_return"; outcome: "succeeded" }>).facts,
        lineItems: [],
      } as never,
    }))).toThrow("line items");
  });

  it("validates provider-observed exchange sides without inventing money", () => {
    expect(() => parseReceiptV1(exchangeReceipt())).not.toThrow();
    expect(() => parseReceiptV1(exchangeReceipt({ providerReference: "different-return" }))).toThrow(
      "providerReference",
    );
    expect(() => parseReceiptV1(exchangeReceipt({
      facts: {
        ...(exchangeReceipt() as Extract<ReceiptV1, { tool: "create_exchange"; outcome: "succeeded" }>).facts,
        replacementItems: [],
      } as never,
    }))).toThrow("replacement items");
    expect(() => parseReceiptV1(exchangeReceipt({
      facts: {
        ...(exchangeReceipt() as Extract<ReceiptV1, { tool: "create_exchange"; outcome: "succeeded" }>).facts,
        financialConsequence: { kind: "charge", amount: "10.00", currency: "usd" },
      } as never,
    }))).toThrow("currency");
  });

  it("validates return-label identity and retained label metadata", () => {
    expect(() => parseReceiptV1(returnLabelReceipt())).not.toThrow();
    expect(() => parseReceiptV1(returnLabelReceipt({
      providerReference: "gid://shopify/ReverseDelivery/different",
    }))).toThrow("providerReference");
    expect(() => parseReceiptV1(returnLabelReceipt({
      facts: {
        ...(returnLabelReceipt() as Extract<ReceiptV1, { tool: "attach_return_label"; outcome: "succeeded" }>).facts,
        labelSha256: "not-a-digest",
      } as never,
    }))).toThrow("labelSha256");
    expect(() => parseReceiptV1(returnLabelReceipt({
      facts: {
        ...(returnLabelReceipt() as Extract<ReceiptV1, { tool: "attach_return_label"; outcome: "succeeded" }>).facts,
        attachmentState: "requested",
      } as never,
    }))).toThrow("attachmentState");
  });

  it("validates provider-confirmed fulfillment identity and facts", () => {
    expect(() => parseReceiptV1(fulfillmentReceipt())).not.toThrow();
    expect(() => parseReceiptV1(fulfillmentReceipt({
      providerReference: "gid://shopify/Fulfillment/different",
    }))).toThrow("providerReference");
    expect(() => parseReceiptV1(fulfillmentReceipt({
      facts: {
        ...(fulfillmentReceipt() as Extract<ReceiptV1, { tool: "fulfill_order"; outcome: "succeeded" }>).facts,
        lineItems: [],
      } as never,
    }))).toThrow("line items");
    expect(() => parseReceiptV1(fulfillmentReceipt({
      facts: {
        ...(fulfillmentReceipt() as Extract<ReceiptV1, { tool: "fulfill_order"; outcome: "succeeded" }>).facts,
        notifyCustomerRequested: "yes",
      } as never,
    }))).toThrow("notifyCustomerRequested");
  });

  // The compound write is the one capability whose partial outcome must survive
  // a non-success receipt: the order address committed even though the overall
  // outcome is uncertain, and dropping its facts would erase the committed half.
  it("keeps compound address facts on an unknown receipt", () => {
    const partial = parseReceiptV1(orderAddressReceipt({
      outcome: "unknown",
      code: "customer_sync_failed_after_order_update",
      facts: {
        orderId: "3001",
        customerId: "900",
        orderAddress: { outcome: "updated", address: ADDRESS },
        customerDefaultAddress: { outcome: "failed", code: "customer_sync_failed_after_order_update" },
      },
    } as never));

    expect(partial.outcome).toBe("unknown");
    expect((partial as Extract<ReceiptV1, { tool: "update_shopify_order_address" }>).facts)
      .toMatchObject({ orderAddress: { outcome: "updated" } });
  });

  it("rejects partial address facts on definitive non-success outcomes", () => {
    const facts = {
      orderId: "3001",
      customerId: "900",
      orderAddress: { outcome: "updated", address: ADDRESS },
      customerDefaultAddress: {
        outcome: "failed",
        code: "customer_sync_failed_after_order_update",
      },
    };

    for (const outcome of ["not_found", "rejected", "failed"] as const) {
      expect(() => parseReceiptV1(orderAddressReceipt({
        outcome,
        code: "definitive_outcome",
        facts,
      } as never))).toThrow("partial order address facts require an unknown outcome");
    }
  });

  it("binds a partial unknown address receipt to its provider order reference", () => {
    expect(() => parseReceiptV1(orderAddressReceipt({
      outcome: "unknown",
      code: "customer_sync_failed_after_order_update",
      providerReference: "different-order",
      facts: {
        orderId: "3001",
        customerId: "900",
        orderAddress: { outcome: "updated", address: ADDRESS },
        customerDefaultAddress: {
          outcome: "failed",
          code: "customer_sync_failed_after_order_update",
        },
      },
    } as never))).toThrow("order address providerReference must match facts.orderId");
  });

  it("refuses failure-receipt facts for a tool that has no partial contract", () => {
    expect(() => parseReceiptV1({
      ...refundReceipt(),
      outcome: "unknown",
      code: "uncertain",
      facts: (orderAddressReceipt() as Extract<ReceiptV1, { outcome: "succeeded" }>).facts,
    } as never)).toThrow("failure receipt facts are not supported");
  });

  it("rejects an address receipt whose target or reference leaves its order", () => {
    expect(() => parseReceiptV1(orderAddressReceipt({
      target: { kind: "order", id: "9999" },
    }))).toThrow("order address target must match facts.orderId");
    expect(() => parseReceiptV1(orderAddressReceipt({
      providerReference: "9999",
    }))).toThrow("order address providerReference must match facts.orderId");
  });

  it("rejects an address missing provider-confirmed location fields", () => {
    expect(() => parseReceiptV1(orderAddressReceipt({
      facts: {
        orderId: "3001",
        customerId: "900",
        orderAddress: { outcome: "updated", address: { ...ADDRESS, city: "" } },
        customerDefaultAddress: { outcome: "not_updated", code: "no_default_address" },
      },
    } as never))).toThrow("facts.orderAddress.address.city");
  });

  it("rejects an invalid customer-default-address outcome or code", () => {
    expect(() => parseReceiptV1(orderAddressReceipt({
      facts: {
        orderId: "3001",
        customerId: "900",
        orderAddress: { outcome: "updated", address: ADDRESS },
        customerDefaultAddress: { outcome: "skipped" },
      },
    } as never))).toThrow("facts.customerDefaultAddress.outcome is invalid");
    expect(() => parseReceiptV1(orderAddressReceipt({
      facts: {
        orderId: "3001",
        customerId: "900",
        orderAddress: { outcome: "updated", address: ADDRESS },
        customerDefaultAddress: { outcome: "not_updated", code: "some_other_reason" },
      },
    } as never))).toThrow("facts.customerDefaultAddress.code is invalid");
  });

  it("validates committed order-edit changes and their provider observation", () => {
    expect(() => parseReceiptV1(orderEditReceipt())).not.toThrow();
    expect(() => parseReceiptV1(orderEditReceipt({ providerReference: "different-order" })))
      .toThrow("order edit providerReference");
    expect(() => parseReceiptV1(orderEditReceipt({
      facts: {
        orderId: "3001",
        changes: [{
          kind: "addition",
          variantId: "gid://shopify/ProductVariant/44",
          lineItemId: null,
          requestedQuantity: 2,
          providerObservedFinalQuantity: null,
          outcome: "staged",
        }],
      },
    } as never))).toThrow("must be committed with a provider-observed final quantity");
  });

  it("keeps staged and rejected order-edit legs on an unknown receipt", () => {
    const receipt = parseReceiptV1(orderEditReceipt({
      outcome: "unknown",
      code: "partial_staging_rejected",
      facts: {
        orderId: "3001",
        changes: [
          {
            kind: "addition",
            variantId: "gid://shopify/ProductVariant/44",
            lineItemId: "gid://shopify/CalculatedLineItem/1",
            requestedQuantity: 2,
            providerObservedFinalQuantity: null,
            outcome: "staged",
          },
          {
            kind: "removal",
            variantId: "gid://shopify/ProductVariant/45",
            lineItemId: "gid://shopify/CalculatedLineItem/2",
            requestedQuantity: null,
            providerObservedFinalQuantity: null,
            outcome: "rejected",
          },
        ],
      },
    } as never));

    expect(receipt.outcome).toBe("unknown");
    expect((receipt as Extract<ReceiptV1, { tool: "edit_shopify_order" }>).facts?.changes)
      .toHaveLength(2);
  });

  it("rejects invalid order-edit quantities and definitive partial facts", () => {
    expect(() => parseReceiptV1(orderEditReceipt({
      facts: {
        orderId: "3001",
        changes: [{
          kind: "addition",
          variantId: "gid://shopify/ProductVariant/44",
          lineItemId: null,
          requestedQuantity: 0,
          providerObservedFinalQuantity: 1,
          outcome: "committed",
        }],
      },
    } as never))).toThrow("requestedQuantity");
    expect(() => parseReceiptV1(orderEditReceipt({
      outcome: "failed",
      code: "provider_rejected",
    } as never))).toThrow("partial order edit facts require an unknown outcome");
  });

  it("validates flash-sale provider facts and identity bindings", () => {
    expect(parseReceiptV1(flashSaleReceipt())).toEqual(flashSaleReceipt());
    expect(() => parseReceiptV1(flashSaleReceipt({
      providerReference: "gid://shopify/DiscountAutomaticNode/99",
    }))).toThrow("flash sale providerReference");
    expect(() => parseReceiptV1(flashSaleReceipt({
      target: { kind: "order", id: "42" },
    }))).toThrow("receipt target must be a shop");
  });

  it("rejects incomplete or contradictory flash-sale facts", () => {
    expect(() => parseReceiptV1(flashSaleReceipt({
      facts: {
        ...(flashSaleReceipt() as Extract<ReceiptV1, { tool: "create_flash_sale" }>).facts,
        appliesTo: "entire_catalog",
      },
    } as never))).toThrow("catalog flash sale facts cannot name variants");
    expect(() => parseReceiptV1(flashSaleReceipt({
      facts: {
        ...(flashSaleReceipt() as Extract<ReceiptV1, { tool: "create_flash_sale" }>).facts,
        discountPercentage: "101",
      },
    } as never))).toThrow("cannot exceed 100");
    expect(() => parseReceiptV1(flashSaleReceipt({
      facts: {
        ...(flashSaleReceipt() as Extract<ReceiptV1, { tool: "create_flash_sale" }>).facts,
        endsAt: "2026-09-13T07:00:00.000Z",
      },
    } as never))).toThrow("must be after");
  });

  it("validates an ended flash sale and its exact identity binding", () => {
    expect(parseReceiptV1(endFlashSaleReceipt())).toEqual(endFlashSaleReceipt());
    expect(() => parseReceiptV1(endFlashSaleReceipt({
      providerReference: "gid://shopify/DiscountAutomaticNode/99",
    }))).toThrow("ended flash sale providerReference");
    expect(() => parseReceiptV1(endFlashSaleReceipt({
      target: { kind: "discount", id: "gid://shopify/DiscountAutomaticNode/99" },
    }))).toThrow("ended flash sale target");
  });

  it("rejects an invented end-sale confirmation", () => {
    expect(() => parseReceiptV1(endFlashSaleReceipt({
      facts: {
        ...(endFlashSaleReceipt() as Extract<ReceiptV1, { tool: "end_flash_sale" }>).facts,
        confirmation: "probably_deleted",
      },
    } as never))).toThrow("facts.confirmation is invalid");
  });

  it("validates exact per-batch variant price outcomes", () => {
    expect(parseReceiptV1(variantPriceReceipt())).toEqual(variantPriceReceipt());
    expect(() => parseReceiptV1(variantPriceReceipt({
      facts: {
        ...(variantPriceReceipt() as Extract<ReceiptV1, { tool: "set_variant_prices" }>).facts,
        batches: [{
          productId: "gid://shopify/Product/1",
          outcome: "succeeded",
          confirmation: "mutation_response",
          changes: [{
            productId: "gid://shopify/Product/1",
            variantId: "gid://shopify/ProductVariant/1",
            originalPrice: "48.00",
            requestedPrice: "44.00",
            observedPrice: "43.00",
          }],
        }],
      },
    } as never))).toThrow("observe the requested price");
  });

  it("allows partial variant price facts only on an unknown receipt", () => {
    const facts = (variantPriceReceipt() as Extract<ReceiptV1, { tool: "set_variant_prices" }>).facts;
    expect(parseReceiptV1(variantPriceReceipt({
      outcome: "unknown",
      code: "partial",
      facts: {
        ...facts,
        batches: [{
          ...facts.batches[0],
          outcome: "unknown",
          changes: [{ ...facts.batches[0].changes[0], observedPrice: null }],
        }],
      },
    } as never))).toEqual(expect.objectContaining({ outcome: "unknown" }));
    expect(() => parseReceiptV1(variantPriceReceipt({
      outcome: "failed",
      code: "partial",
    } as never))).toThrow("partial variant price facts require an unknown outcome");
  });

  it("rejects unregistered receipt tools and wrong target kinds", () => {
    expect(() => parseReceiptV1({
      ...refundReceipt(),
      tool: "invented_write",
      outcome: "unknown",
      code: "uncertain",
      facts: undefined,
    })).toThrow("no receipt validator is registered");
    expect(() => parseReceiptV1({
      ...refundReceipt(),
      target: { kind: "customer", id: "customer-1" },
    })).toThrow("target must be an order");
  });

  it("validates internal thread and spam receipts against their durable identities", () => {
    const base = {
      version: 1 as const,
      operationId: "operation-thread-1",
      executionId: "execution-thread-1",
      target: { kind: "thread", id: "thread-1" },
      observedAt: "2026-09-15T07:00:00.000Z",
      outcome: "succeeded" as const,
    };
    const note = parseReceiptV1({
      ...base,
      tool: "add_internal_note",
      providerReference: "message-1",
      facts: {
        threadId: "thread-1",
        messageId: "message-1",
        contentSha256: "a".repeat(64),
      },
    });
    expect(note.tool).toBe("add_internal_note");
    expect(parseReceiptV1({
      ...base,
      tool: "update_thread_status",
      providerReference: "thread-1",
      facts: { threadId: "thread-1", beforeStatus: "open", afterStatus: "closed" },
    }).tool).toBe("update_thread_status");
    expect(parseReceiptV1({
      ...base,
      tool: "update_thread_tag",
      providerReference: "thread-1",
      facts: { threadId: "thread-1", beforeTag: null, afterTag: "Shipping" },
    }).tool).toBe("update_thread_tag");
    expect(parseReceiptV1({
      ...base,
      tool: "mark_ticket_spam",
      providerReference: "thread-1",
      facts: {
        threadId: "thread-1",
        beforeFilterState: "genuine",
        afterFilterState: "filtered",
        decidedAt: "2026-09-15T07:00:00.000Z",
      },
    }).tool).toBe("mark_ticket_spam");
    expect(() => parseReceiptV1({
      ...base,
      tool: "add_internal_note",
      providerReference: "wrong-message",
      facts: {
        threadId: "thread-1",
        messageId: "message-1",
        contentSha256: "a".repeat(64),
      },
    })).toThrow("providerReference must match facts.messageId");
  });

  it("validates durable communication state without treating queue acceptance as delivery", () => {
    const receipt = parseReceiptV1({
      version: 1,
      operationId: "operation-send-1",
      executionId: "execution-send-1",
      tool: "send_email",
      target: { kind: "thread", id: "thread-1" },
      observedAt: "2026-09-15T07:00:00.000Z",
      providerReference: "message-1",
      outcome: "succeeded",
      facts: {
        logicalResponseId: "message-1",
        messageId: "message-1",
        threadId: "thread-1",
        destination: { kind: "email", id: "customer@example.com" },
        contentSha256: "b".repeat(64),
        deliveryState: "accepted",
        providerMessageId: null,
      },
    });
    expect(receipt.outcome).toBe("succeeded");
    expect(() => parseReceiptV1({
      ...receipt,
      facts: { ...receipt.facts, deliveryState: "unknown" },
    })).toThrow("successful communication cannot have unknown delivery state");
  });
});
