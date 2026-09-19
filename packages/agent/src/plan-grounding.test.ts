import { describe, expect, it } from "vitest";
import { applyEscalationRouting } from "./escalation-materialization.js";
import {
  detectUngroundedEscalationReasons,
  detectUngroundedReplyText,
  renderReplyCompletionClaims,
} from "./plan-grounding.js";

describe("escalation materialization", () => {
  it("keeps reads but replaces model actions and escalation text", () => {
    expect(applyEscalationRouting([
      { id: "read", name: "get_order_by_name", input: { order_name: "#1" } },
      { id: "refund", name: "create_refund", input: { order_id: "1" } },
      { id: "old", name: "escalate_to_human", input: { reason: "I refunded it." } },
    ], "Trusted reason.")).toEqual([
      { id: "read", name: "get_order_by_name", input: { order_name: "#1" } },
      { id: "tu_route_escalate", name: "escalate_to_human", input: { reason: "Trusted reason." } },
    ]);
  });

  it("keeps a storefront reply only when explicitly requested", () => {
    const calls = [{ id: "reply", name: "send_reply", input: { text: "A human will help." } }];
    expect(applyEscalationRouting(calls, "Human.").map((call) => call.name))
      .toEqual(["escalate_to_human"]);
    expect(applyEscalationRouting(calls, "Human.", { keepReply: true }).map((call) => call.name))
      .toEqual(["send_reply", "escalate_to_human"]);
  });
});

describe("plan grounding", () => {
  it.each([
    ["return", "We've created your return.", "A return has been created for order #1001."],
    ["exchange", "We've created your exchange.", "An exchange has been created for order #1001."],
    ["cancellation", "We've canceled the order.", "Order #1001 has been canceled."],
    ["store_credit", "We've issued your store credit.", "Store credit of $20.00 has been issued."],
    ["address_update", "We've updated the address.", "The address for order #1001 has been updated."],
    ["customer_update", "We've updated the customer profile.", "The customer profile has been updated."],
    ["customer_note", "We've added a note.", "A note has been added to the customer profile."],
    ["fulfillment", "We've fulfilled the order.", "Order #1001 has been fulfilled."],
    ["order_creation", "We've created the order.", "The order has been created."],
    ["order_update", "We've updated the order.", "Order #1001 has been updated."],
    ["price_update", "We've updated the prices.", "The variant prices have been updated."],
    ["discount", "We've applied the discount.", "The discount has been applied."],
  ] as const)("renders a deterministic %s completion statement", (action, text, expected) => {
    const rendered = renderReplyCompletionClaims({
      id: "reply",
      name: "send_reply",
      input: { text },
    }, [{
      action,
      target: { kind: "order", id: "123", aliases: ["#1001"] },
      amount: "20.00",
      currency: "USD",
      outcome: "success",
      executionReference: "operation_1",
      sourceTool: "test",
    }]);

    expect(rendered.input).toEqual({ text: expected });
  });

  it("keeps a non-USD refund in trailing-ISO form", () => {
    const rendered = renderReplyCompletionClaims({
      id: "reply",
      name: "send_reply",
      input: { text: "We've issued your refund." },
    }, [{
      action: "refund",
      amount: "18.50",
      currency: "EUR",
      outcome: "success",
      executionReference: "refund_1",
      sourceTool: "create_refund",
    }]);

    expect(rendered.input).toEqual({ text: "A refund of 18.50 EUR has been issued." });
  });

  it("does not turn a contrastive refund mention into a rendered refund claim", () => {
    const rendered = renderReplyCompletionClaims({
      id: "reply",
      name: "send_reply",
      input: { text: "We've issued store credit instead of a refund." },
    }, [
      {
        action: "store_credit",
        amount: "20.00",
        currency: "USD",
        outcome: "success",
        executionReference: "credit_1",
        sourceTool: "create_gift_card",
      },
      {
        action: "refund",
        amount: "20.00",
        currency: "USD",
        outcome: "success",
        executionReference: "refund_1",
        sourceTool: "create_refund",
      },
    ]);

    expect(rendered.input).toEqual({ text: "Store credit of $20.00 has been issued." });
  });

  it("rejects unsupported escalation and customer-facing mutation claims", () => {
    expect(detectUngroundedEscalationReasons([{
      id: "esc",
      name: "escalate_to_human",
      input: { reason: "I've issued the refund." },
    }])).toEqual([expect.objectContaining({ toolCallId: "esc" })]);
    expect(detectUngroundedReplyText([{
      id: "reply",
      name: "send_reply",
      input: { text: "I'll issue the refund now." },
    }])).toEqual([expect.objectContaining({ toolCallId: "reply" })]);
  });

  it("does not let an unrelated action or generic order edit ground a refund", () => {
    for (const action of ["create_return", "edit_shopify_order"]) {
      expect(detectUngroundedEscalationReasons([
        { id: "action", name: action, input: {} },
        {
          id: "esc",
          name: "escalate_to_human",
          input: { reason: "I've refunded the order." },
        },
      ])).toEqual([expect.objectContaining({ toolCallId: "esc" })]);
    }
  });

  it("accepts matching return, refund, and cancellation actions", () => {
    const examples = [
      ["create_return", { order_id: "123" }, "A return has been initiated."],
      ["create_refund", { order_id: "123", amount: "20.00" }, "I've refunded the order."],
      ["cancel_order", { order_id: "123" }, "I've canceled the order."],
    ] as const;
    for (const [action, input, reason] of examples) {
      expect(detectUngroundedEscalationReasons([
        { id: "action", name: action, input },
        { id: "esc", name: "escalate_to_human", input: { reason } },
      ])).toEqual([]);
    }
  });

  it("recognizes cancellation's refund side effect without requiring a duplicate refund", () => {
    expect(detectUngroundedReplyText([
      { id: "cancel", name: "cancel_order", input: { order_id: "123" } },
      {
        id: "reply",
        name: "send_reply",
        input: { text: "I've canceled the order and refunded the payment." },
      },
    ])).toEqual([]);
  });

  it("does not mistake money returning to a card for a product-return operation", () => {
    expect(detectUngroundedReplyText([
      { id: "refund", name: "create_refund", input: { order_id: "123", amount: "20.00" } },
      {
        id: "reply",
        name: "send_reply",
        input: { text: "I've issued the refund; the funds will be returned to your card." },
      },
    ])).toEqual([]);
  });

  it("does not treat an explicitly negated refund as a second claimed operation", () => {
    for (const text of [
      "I've issued a $15 store credit gift card — no refund needed.",
      "I've issued a $15 store credit gift card without a refund.",
      "I've issued a $15 store credit gift card; a refund was not required.",
      // The phrasing that was not on the deleted-phrase list, and so invalidated a
      // correct plan on run 33120836618: a store-credit reply naming the refund it
      // replaces. The claim verb governs "store credit"; "a refund" is the object of
      // "instead of", which claims nothing.
      "I've issued a $15 store credit (gift card) to your account for order #10101 instead of a refund, as requested.",
      "I've issued a $15 store credit gift card rather than a refund.",
      "I've issued a $15 store credit gift card in place of a refund.",
    ]) {
      expect(detectUngroundedReplyText([
        { id: "credit", name: "create_gift_card", input: { customer_id: "456", amount: "15.00" } },
        { id: "reply", name: "send_reply", input: { text } },
      ])).toEqual([]);
    }
  });

  it("still catches a real second claim that a contrastive phrase sits beside", () => {
    // "instead of a refund" is inert, but "and opened a return" is a coordinated
    // verb phrase making a second claim — the distinction the span bound exists for.
    expect(detectUngroundedReplyText([
      { id: "credit", name: "create_gift_card", input: { customer_id: "456", amount: "15.00" } },
      {
        id: "reply",
        name: "send_reply",
        input: {
          text: "I've issued a $15 store credit instead of a refund and opened a return.",
        },
      },
    ])).toEqual([expect.objectContaining({ toolCallId: "reply" })]);
  });

  // Second claims a coordinator never introduces, so CLAIM_CONTINUATION cannot
  // see them. Each one is grounded only if it is its own claim span.
  const PUNCTUATION_JOINED_CLAIMS = [
    "I've issued your refund, I've cancelled the order.",
    "I've issued your refund; I've cancelled the order.",
    "I've issued your refund - I've cancelled the order.",
  ];

  it("catches a second claim joined by punctuation rather than a coordinator", () => {
    // A coordinated verb phrase is not the only way to make a second claim.
    // Joined by a comma, semicolon or dash, the continuation pattern never sees
    // it, so each verb-anchored claim has to be its own span — otherwise the
    // reply promises a cancellation the plan never performs.
    for (const text of PUNCTUATION_JOINED_CLAIMS) {
      expect(detectUngroundedReplyText([
        { id: "refund", name: "create_refund", input: { order_id: "123", amount: "20.00" } },
        { id: "reply", name: "send_reply", input: { text } },
      ])).toEqual([expect.objectContaining({ toolCallId: "reply" })]);
    }
  });

  it("clears the same sentence once every claim has its tool", () => {
    for (const text of PUNCTUATION_JOINED_CLAIMS) {
      expect(detectUngroundedReplyText([
        { id: "refund", name: "create_refund", input: { order_id: "123", amount: "20.00" } },
        { id: "cancel", name: "cancel_order", input: { order_id: "123" } },
        { id: "reply", name: "send_reply", input: { text } },
      ])).toEqual([]);
    }
  });

  it("requires every independently claimed operation in a compound sentence", () => {
    expect(detectUngroundedReplyText([
      { id: "refund", name: "create_refund", input: { order_id: "123", amount: "20.00" } },
      {
        id: "reply",
        name: "send_reply",
        input: { text: "I've refunded the order and opened a return." },
      },
    ])).toEqual([expect.objectContaining({ toolCallId: "reply" })]);

    expect(detectUngroundedReplyText([
      { id: "refund", name: "create_refund", input: { order_id: "123", amount: "20.00" } },
      { id: "return", name: "create_return", input: { order_id: "123" } },
      {
        id: "reply",
        name: "send_reply",
        input: { text: "I've refunded the order and opened a return." },
      },
    ])).toEqual([]);
  });

  it("does not mistake customer-attributed history for an agent claim", () => {
    expect(detectUngroundedEscalationReasons([{
      id: "esc",
      name: "escalate_to_human",
      input: { reason: "The customer says the refund was already issued." },
    }])).toEqual([]);
  });

  it("rejects unsupported plural and passive completion claims", () => {
    for (const text of [
      "We have issued your refund.",
      "Your refund has been issued.",
    ]) {
      expect(detectUngroundedReplyText([{
        id: "reply",
        name: "send_reply",
        input: { text },
      }])).toEqual([expect.objectContaining({ toolCallId: "reply" })]);
    }
  });

  it("requires the action to precede its completion reply", () => {
    expect(detectUngroundedReplyText([
      { id: "reply", name: "send_reply", input: { text: "We have issued your refund." } },
      { id: "refund", name: "create_refund", input: { order_id: "123", amount: "20.00", currency: "USD" } },
    ])).toEqual([expect.objectContaining({ toolCallId: "reply" })]);
  });

  it("grounds a refund named by the order name the plan itself read", () => {
    // Production 2026-09-10: an Instagram shopper with no linked Shopify
    // customer asked for a refund on order 1031. ctx.recentOrders is empty for
    // an unresolved customer, so the only place the name "#1031" exists is the
    // plan's own get_order_by_name result — and the reply names the order the
    // way the customer does. Without the read result the claim read as
    // ungrounded and the whole plan became unapprovable.
    const calls = [
      { id: "read", name: "get_order_by_name", input: { order_name: "1031" } },
      {
        id: "refund",
        name: "create_refund",
        input: { order_id: "6163445514474", amount: "43.48", currency: "USD" },
      },
      {
        id: "reply",
        name: "send_reply",
        input: { text: "I've processed a full refund of $43.48 for order #1031." },
      },
    ];
    const readResults = {
      read: JSON.stringify({ id: "6163445514474", name: "#1031", currency: "USD" }),
    };

    expect(detectUngroundedReplyText(calls, { readResults })).toEqual([]);
    expect(detectUngroundedReplyText(calls)).toEqual([
      expect.objectContaining({ toolCallId: "reply" }),
    ]);
  });

  it("does not let a read of one order ground a claim about another", () => {
    const readResults = {
      read: JSON.stringify({ id: "6163445514474", name: "#9999", currency: "USD" }),
    };
    expect(detectUngroundedReplyText([
      { id: "read", name: "get_order_by_name", input: { order_name: "9999" } },
      {
        id: "refund",
        name: "create_refund",
        input: { order_id: "6163445514474", amount: "43.48", currency: "USD" },
      },
      {
        id: "reply",
        name: "send_reply",
        input: { text: "I've processed a full refund of $43.48 for order #1031." },
      },
    ], { readResults })).toEqual([expect.objectContaining({ toolCallId: "reply" })]);
  });

  it("rejects wrong order, amount, and currency in completion copy", () => {
    const action = {
      id: "refund",
      name: "create_refund",
      input: { order_id: "123", amount: "20.00", currency: "USD" },
    };
    const results = [
      "We refunded order 999.",
      "We refunded $21.00 for the order.",
      "We refunded EUR 20.00 for the order.",
    ].map((text) => detectUngroundedReplyText([
        action,
        { id: "reply", name: "send_reply", input: { text } },
      ]));
    expect(detectUngroundedReplyText([
      { id: "reply", name: "send_reply", input: { text: "We refunded $21.00 for the order." } },
    ])).toEqual([expect.objectContaining({ toolCallId: "reply" })]);
    expect(results).toEqual([
      [expect.objectContaining({ toolCallId: "reply" })],
      [expect.objectContaining({ toolCallId: "reply" })],
      [expect.objectContaining({ toolCallId: "reply" })],
    ]);
  });

  it("rejects a completion email sent to a different recipient", () => {
    expect(detectUngroundedReplyText([
      { id: "refund", name: "create_refund", input: { order_id: "123", amount: "20.00", currency: "USD" } },
      {
        id: "email",
        name: "send_email",
        input: { to: "wrong@example.com", subject: "Refund", body: "We issued your refund." },
      },
    ], {
      ctx: {
        shopify: null,
        customer: { id: "customer_1", name: "Ada", platformId: "ada@example.com" },
      },
    })).toEqual([expect.objectContaining({ toolCallId: "email" })]);
  });

  it("allows passive historical facts only when a live read proves them", () => {
    const calls = [
      { id: "read", name: "get_order_by_name", input: { order_name: "#1001" } },
      { id: "reply", name: "send_reply", input: { text: "Your refund has been issued." } },
    ];
    expect(detectUngroundedReplyText(calls, {
      readResults: {
        read: JSON.stringify({
          id: "123",
          name: "#1001",
          financial_status: "refunded",
          fulfillment_status: null,
          total_price: "20.00",
          currency: "USD",
        }),
      },
    })).toEqual([]);
  });
});
