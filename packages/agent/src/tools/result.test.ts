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

describe("receipt v1", () => {
  it("validates exact refund facts independently of display text", () => {
    const receipt = refundReceipt();
    expect(validateToolResultReceipt({ status: "ok", message: "first wording", receipt })).toEqual(receipt);
    expect(validateToolResultReceipt({ status: "ok", message: "completely different wording", receipt })).toEqual(receipt);
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
});
