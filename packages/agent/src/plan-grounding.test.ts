import { describe, expect, it } from "vitest";
import { applyEscalationRouting } from "./escalation-materialization.js";
import {
  detectUngroundedEscalationReasons,
  detectUngroundedReplyText,
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
      ["create_return", "A return has been initiated."],
      ["create_refund", "I've refunded the order."],
      ["cancel_order", "I've canceled the order."],
    ] as const;
    for (const [action, reason] of examples) {
      expect(detectUngroundedEscalationReasons([
        { id: "action", name: action, input: {} },
        { id: "esc", name: "escalate_to_human", input: { reason } },
      ])).toEqual([]);
    }
  });

  it("recognizes cancellation's refund side effect without requiring a duplicate refund", () => {
    expect(detectUngroundedReplyText([
      { id: "cancel", name: "cancel_order", input: {} },
      {
        id: "reply",
        name: "send_reply",
        input: { text: "I've canceled the order and refunded the payment." },
      },
    ])).toEqual([]);
  });

  it("does not mistake money returning to a card for a product-return operation", () => {
    expect(detectUngroundedReplyText([
      { id: "refund", name: "create_refund", input: {} },
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
        { id: "credit", name: "create_gift_card", input: {} },
        { id: "reply", name: "send_reply", input: { text } },
      ])).toEqual([]);
    }
  });

  it("still catches a real second claim that a contrastive phrase sits beside", () => {
    // "instead of a refund" is inert, but "and opened a return" is a coordinated
    // verb phrase making a second claim — the distinction the span bound exists for.
    expect(detectUngroundedReplyText([
      { id: "credit", name: "create_gift_card", input: {} },
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
        { id: "refund", name: "create_refund", input: {} },
        { id: "reply", name: "send_reply", input: { text } },
      ])).toEqual([expect.objectContaining({ toolCallId: "reply" })]);
    }
  });

  it("clears the same sentence once every claim has its tool", () => {
    for (const text of PUNCTUATION_JOINED_CLAIMS) {
      expect(detectUngroundedReplyText([
        { id: "refund", name: "create_refund", input: {} },
        { id: "cancel", name: "cancel_order", input: {} },
        { id: "reply", name: "send_reply", input: { text } },
      ])).toEqual([]);
    }
  });

  it("requires every independently claimed operation in a compound sentence", () => {
    expect(detectUngroundedReplyText([
      { id: "refund", name: "create_refund", input: {} },
      {
        id: "reply",
        name: "send_reply",
        input: { text: "I've refunded the order and opened a return." },
      },
    ])).toEqual([expect.objectContaining({ toolCallId: "reply" })]);

    expect(detectUngroundedReplyText([
      { id: "refund", name: "create_refund", input: {} },
      { id: "return", name: "create_return", input: {} },
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
});
