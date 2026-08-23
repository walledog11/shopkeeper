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
