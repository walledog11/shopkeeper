import { describe, expect, it } from "vitest";
import { executedCompletionFacts } from "./completion-facts.js";

describe("completion facts", () => {
  it("grounds a completed return in its receipt instead of display wording", () => {
    const common = {
      tool: "create_return",
      input: { order_id: "wrong-order" },
      status: "success" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-return-1",
        executionId: "execution-return-1",
        tool: "create_return" as const,
        target: { kind: "order", id: "2001" },
        observedAt: "2026-09-12T07:00:00.000Z",
        outcome: "succeeded" as const,
        providerReference: "gid://shopify/Return/999",
        facts: {
          orderId: "2001",
          returnId: "gid://shopify/Return/999",
          returnName: "#2001-R1",
          status: "REQUESTED",
          lineItems: [{ fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/321", quantity: 1 }],
          refundIssued: false as const,
        },
      },
    };

    const first = executedCompletionFacts([{ ...common, result: "Return opened." }]);
    const second = executedCompletionFacts([{ ...common, result: "Different display wording." }]);

    expect(first).toEqual(second);
    expect(first).toEqual([expect.objectContaining({
      action: "return",
      target: { kind: "order", id: "2001" },
      outcome: "success",
      executionReference: "operation-return-1",
    })]);
  });

  it("grounds both sides of an exchange in one receipt", () => {
    const common = {
      tool: "create_exchange",
      input: { order_id: "wrong-order" },
      status: "success" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-exchange-1",
        executionId: "execution-exchange-1",
        tool: "create_exchange" as const,
        target: { kind: "order", id: "2001" },
        observedAt: "2026-09-12T07:00:00.000Z",
        outcome: "succeeded" as const,
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
      },
    };

    const first = executedCompletionFacts([{ ...common, result: "Exchange opened." }]);
    const second = executedCompletionFacts([{ ...common, result: "Different display wording." }]);

    expect(first).toEqual(second);
    expect(first.map((fact) => fact.action)).toEqual(["exchange", "return"]);
    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: { kind: "order", id: "2001" },
        outcome: "success",
        executionReference: "operation-exchange-1",
      }),
    ]));
  });

  it("grounds a return-label attachment in its receipt instead of display wording", () => {
    const common = {
      tool: "attach_return_label",
      input: { order_id: "wrong-order", label_url: "https://example.com/label.pdf" },
      status: "success" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-label-1",
        executionId: "execution-label-1",
        tool: "attach_return_label" as const,
        target: { kind: "order", id: "2001" },
        observedAt: "2026-09-12T07:00:00.000Z",
        outcome: "succeeded" as const,
        providerReference: "gid://shopify/ReverseDelivery/777",
        facts: {
          orderId: "2001",
          returnId: "gid://shopify/Return/999",
          reverseFulfillmentOrderId: "gid://shopify/ReverseFulfillmentOrder/555",
          reverseDeliveryId: "gid://shopify/ReverseDelivery/777",
          labelSha256: "a".repeat(64),
          trackingNumber: "1Z999",
          attachmentState: "attached" as const,
        },
      },
    };

    const first = executedCompletionFacts([{ ...common, result: "Label attached." }]);
    const second = executedCompletionFacts([{ ...common, result: "Different display wording." }]);

    expect(first).toEqual(second);
    expect(first).toEqual([expect.objectContaining({
      action: "return",
      target: { kind: "order", id: "2001" },
      outcome: "success",
      executionReference: "operation-label-1",
    })]);
  });

  it("grounds fulfillment in its receipt instead of requested input or display wording", () => {
    const common = {
      tool: "fulfill_order",
      input: { order_id: "wrong-order", tracking_number: "REQUESTED" },
      status: "success" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-fulfillment-1",
        executionId: "execution-fulfillment-1",
        tool: "fulfill_order" as const,
        target: { kind: "order", id: "2001" },
        observedAt: "2026-09-12T07:00:00.000Z",
        outcome: "succeeded" as const,
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
      },
    };

    const first = executedCompletionFacts([{ ...common, result: "Order shipped." }]);
    const second = executedCompletionFacts([{ ...common, result: "Different display wording." }]);

    expect(first).toEqual(second);
    expect(first).toEqual([expect.objectContaining({
      action: "fulfillment",
      target: { kind: "order", id: "2001" },
      outcome: "success",
      executionReference: "operation-fulfillment-1",
    })]);
  });

  it("grounds an address change in its receipt rather than the requested input", () => {
    const address = {
      firstName: null,
      lastName: null,
      address1: "123 Main St",
      address2: null,
      city: "Los Angeles",
      province: "California",
      provinceCode: "CA",
      postalCode: "90001",
      country: "United States",
      countryCode: "US",
    };
    const common = {
      tool: "update_shopify_order_address",
      input: { order_id: "wrong-order", city: "Requested City" },
      status: "success" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-address-1",
        executionId: "execution-address-1",
        tool: "update_shopify_order_address" as const,
        target: { kind: "order", id: "3001" },
        observedAt: "2026-09-12T08:00:00.000Z",
        outcome: "succeeded" as const,
        providerReference: "3001",
        facts: {
          orderId: "3001",
          customerId: "900",
          orderAddress: { outcome: "updated" as const, address },
          customerDefaultAddress: { outcome: "updated" as const, addressId: "789", address },
        },
      },
    };

    const first = executedCompletionFacts([{ ...common, result: "Address updated." }]);
    const second = executedCompletionFacts([{ ...common, result: "Totally different wording." }]);

    expect(first).toEqual(second);
    expect(first).toEqual([expect.objectContaining({
      action: "address_update",
      target: { kind: "order", id: "3001" },
      outcome: "success",
      executionReference: "operation-address-1",
    })]);
  });

  it("grounds an order edit in committed receipt changes rather than requested input or wording", () => {
    const common = {
      tool: "edit_shopify_order",
      input: { order_id: "wrong-order", variant_id: "wrong-variant", quantity: 99 },
      status: "success" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-edit-1",
        executionId: "execution-edit-1",
        tool: "edit_shopify_order" as const,
        target: { kind: "order", id: "3001" },
        observedAt: "2026-09-12T08:00:00.000Z",
        outcome: "succeeded" as const,
        providerReference: "3001",
        facts: {
          orderId: "3001",
          changes: [{
            kind: "addition" as const,
            variantId: "gid://shopify/ProductVariant/44",
            lineItemId: "gid://shopify/LineItem/55",
            requestedQuantity: 2,
            providerObservedFinalQuantity: 3,
            outcome: "committed" as const,
          }],
        },
      },
    };

    const first = executedCompletionFacts([{ ...common, result: "Order edited." }]);
    const second = executedCompletionFacts([{ ...common, result: "Different display wording." }]);

    expect(first).toEqual(second);
    expect(first).toEqual([expect.objectContaining({
      action: "order_update",
      target: { kind: "order", id: "3001" },
      outcome: "success",
      executionReference: "operation-edit-1",
    })]);
  });

  it("grounds a customer-profile update in receipt identity rather than input or wording", () => {
    const common = {
      tool: "update_shopify_customer_info",
      input: { customer_id: "wrong-customer", first_name: "Requested" },
      status: "success" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-customer-1",
        executionId: "execution-customer-1",
        tool: "update_shopify_customer_info" as const,
        target: { kind: "customer", id: "9001" },
        observedAt: "2026-09-13T08:00:00.000Z",
        outcome: "succeeded" as const,
        providerReference: "9001",
        facts: {
          customerId: "9001",
          updates: [{ field: "firstName" as const, value: "Observed" }],
        },
      },
    };

    const first = executedCompletionFacts([{ ...common, result: "Profile updated." }]);
    const second = executedCompletionFacts([{ ...common, result: "Entirely different display text." }]);

    expect(first).toEqual(second);
    expect(first).toEqual([expect.objectContaining({
      action: "customer_update",
      target: { kind: "customer", id: "9001" },
      outcome: "success",
      executionReference: "operation-customer-1",
    })]);
  });

  it("grounds a customer-note append in its receipt without exposing note text", () => {
    const facts = executedCompletionFacts([{
      tool: "add_shopify_customer_note",
      input: { customer_id: "wrong-customer", note: "private text" },
      result: "A note was added.",
      status: "success" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-note-1",
        executionId: "execution-note-1",
        tool: "add_shopify_customer_note" as const,
        target: { kind: "customer", id: "9001" },
        observedAt: "2026-09-13T08:00:00.000Z",
        outcome: "succeeded" as const,
        providerReference: "9001",
        facts: {
          customerId: "9001",
          previousNoteSha256: "a".repeat(64),
          appendedNoteSha256: "b".repeat(64),
          resultingNoteSha256: "c".repeat(64),
          resultingNoteLength: 42,
          appendState: "appended" as const,
        },
      },
    }]);

    expect(facts).toEqual([expect.objectContaining({
      action: "customer_note",
      target: { kind: "customer", id: "9001" },
      outcome: "success",
      executionReference: "operation-note-1",
    })]);
    expect(JSON.stringify(facts)).not.toContain("private text");
  });

  it("does not call staged order-edit legs completed", () => {
    const facts = executedCompletionFacts([{
      tool: "edit_shopify_order",
      input: { order_id: "3001", variant_id: "44", quantity: 2 },
      result: "The addition was staged but the swap did not commit.",
      status: "unknown" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-edit-2",
        executionId: "execution-edit-2",
        tool: "edit_shopify_order" as const,
        target: { kind: "order", id: "3001" },
        observedAt: "2026-09-12T08:00:00.000Z",
        outcome: "unknown" as const,
        code: "partial_staging_rejected",
        providerReference: "3001",
        facts: {
          orderId: "3001",
          changes: [{
            kind: "addition" as const,
            variantId: "gid://shopify/ProductVariant/44",
            lineItemId: null,
            requestedQuantity: 2,
            providerObservedFinalQuantity: null,
            outcome: "staged" as const,
          }],
        },
      },
    }]);

    expect(facts).toEqual([expect.objectContaining({
      action: "order_update",
      outcome: "unknown",
      target: { kind: "order", id: "3001" },
    })]);
  });

  // A committed order address stays claimable even though the customer profile
  // half is uncertain; the merchant can be told the order was changed without
  // being told the profile was.
  it("supports the committed half of a partial address change", () => {
    const address = {
      firstName: null,
      lastName: null,
      address1: "123 Main St",
      address2: null,
      city: "Los Angeles",
      province: "California",
      provinceCode: "CA",
      postalCode: "90001",
      country: "United States",
      countryCode: "US",
    };
    const facts = executedCompletionFacts([{
      tool: "update_shopify_order_address",
      input: { order_id: "3001" },
      result: "Partial: the order address was updated, the customer profile was not.",
      status: "unknown" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-address-2",
        executionId: "execution-address-2",
        tool: "update_shopify_order_address" as const,
        target: { kind: "order", id: "3001" },
        observedAt: "2026-09-12T08:00:00.000Z",
        outcome: "unknown" as const,
        code: "customer_sync_failed_after_order_update",
        providerReference: "3001",
        facts: {
          orderId: "3001",
          customerId: "900",
          orderAddress: { outcome: "updated" as const, address },
          customerDefaultAddress: {
            outcome: "failed" as const,
            code: "customer_sync_failed_after_order_update",
          },
        },
      },
    }]);

    expect(facts).toEqual([expect.objectContaining({
      action: "address_update",
      target: { kind: "order", id: "3001" },
      outcome: "success",
    })]);
  });

  it("does not accept definitive rejection facts as a completed address change", () => {
    const address = {
      firstName: null,
      lastName: null,
      address1: "123 Main St",
      address2: null,
      city: "Los Angeles",
      province: "California",
      provinceCode: "CA",
      postalCode: "90001",
      country: "United States",
      countryCode: "US",
    };

    expect(() => executedCompletionFacts([{
      tool: "update_shopify_order_address",
      result: "Rejected.",
      status: "policy_block",
      receipt: {
        version: 1,
        operationId: "operation-address-rejected",
        executionId: "execution-address-rejected",
        tool: "update_shopify_order_address",
        target: { kind: "order", id: "3001" },
        observedAt: "2026-09-12T08:00:00.000Z",
        outcome: "rejected",
        code: "blocked",
        providerReference: "3001",
        facts: {
          orderId: "3001",
          customerId: "900",
          orderAddress: { outcome: "updated", address },
          customerDefaultAddress: { outcome: "failed", code: "blocked" },
        },
      } as never,
    }])).toThrow("partial order address facts require an unknown outcome");
  });
});
