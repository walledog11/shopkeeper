import { describe, expect, it } from "vitest";
import { mutativeIntentActionFailures } from "./runner";

describe("mutativeIntentActionFailures", () => {
  it("does nothing when the flag is off", () => {
    expect(mutativeIntentActionFailures({
      enabled: false,
      customerTexts: ["Please refund order #4003."],
      rawToolCalls: [{ name: "send_reply" }],
    })).toEqual([]);
  });

  it("does nothing when customer text has no mutative intent", () => {
    expect(mutativeIntentActionFailures({
      enabled: true,
      customerTexts: ["Where is my order #4003?"],
      rawToolCalls: [{ name: "send_reply" }],
    })).toEqual([]);
  });

  it("fails on a hollow reply-only refund plan", () => {
    expect(mutativeIntentActionFailures({
      enabled: true,
      customerTexts: ["Please refund order #4003."],
      rawToolCalls: [{ name: "send_reply" }],
    })).toEqual([
      "mutative intent present but plan is reply-only (send_reply without action or escalation); called: [send_reply]",
    ]);
  });

  it("passes when an action tool is planned", () => {
    expect(mutativeIntentActionFailures({
      enabled: true,
      customerTexts: ["Please refund order #4003."],
      rawToolCalls: [{ name: "create_refund" }, { name: "send_reply" }],
    })).toEqual([]);
  });

  it("passes when the plan escalates instead of acting", () => {
    expect(mutativeIntentActionFailures({
      enabled: true,
      customerTexts: ["Please refund order #4003."],
      rawToolCalls: [{ name: "escalate_to_human" }],
    })).toEqual([]);
  });

  it("passes when mutative intent is present but no reply was drafted", () => {
    expect(mutativeIntentActionFailures({
      enabled: true,
      customerTexts: ["Please refund order #4003."],
      rawToolCalls: [{ name: "get_shopify_orders" }],
    })).toEqual([]);
  });
});
