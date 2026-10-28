import { describe, expect, it } from "vitest";
import {
  parseReceiptV1,
  receiptAsUnknown,
  ReceiptValidationError,
  validateToolResultReceipt,
  type ReceiptV1,
} from "./result.js";
import {
  customerInfoReceipt,
  customerNoteReceipt,
  endFlashSaleReceipt,
  flashSaleReceipt,
  giftCardReceipt,
  orderCreationReceipt,
  refundReceipt,
  variantPriceReceipt,
} from "../test-fixtures/receipts.js";

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

  it("accepts a cancellation's refund, a null one, and the receipts written before it existed", () => {
    const cancellation = (refund?: unknown) => ({
      version: 1 as const,
      operationId: "operation-1",
      executionId: "execution-1",
      tool: "cancel_order",
      target: { kind: "order", id: "123" },
      observedAt: "2026-09-28T06:20:41.000Z",
      outcome: "succeeded",
      providerReference: null,
      facts: {
        orderId: "123",
        cancelledAt: "2026-09-28T06:20:40Z",
        reason: "customer",
        financialStatus: "refunded",
        restockResult: null,
        ...(refund === undefined ? {} : { refund }),
      },
    });
    expect(() => parseReceiptV1(cancellation())).not.toThrow();
    expect(() => parseReceiptV1(cancellation(null))).not.toThrow();
    expect(() => parseReceiptV1(cancellation({ amount: "49.95", currency: "USD" }))).not.toThrow();
    expect(() => parseReceiptV1(cancellation({ amount: "49.95", currency: "usd" }))).toThrow("facts.refund.currency");
    expect(() => parseReceiptV1(cancellation({ amount: "-1", currency: "USD" }))).toThrow("facts.refund.amount");
    expect(() => parseReceiptV1(cancellation("49.95"))).toThrow("facts.refund");
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
