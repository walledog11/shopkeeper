import { describe, expect, it } from "vitest";
import { parseReceiptV1, type ReceiptV1 } from "./result.js";
import {
  ADDRESS,
  exchangeReceipt,
  fulfillmentReceipt,
  orderAddressReceipt,
  orderEditReceipt,
  refundReceipt,
  returnLabelReceipt,
  returnReceipt,
} from "../test-fixtures/receipts.js";

describe("receipt v1", () => {
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
});
