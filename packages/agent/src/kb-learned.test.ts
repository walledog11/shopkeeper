import { describe, expect, it } from "vitest";
import {
  AGENT_LEARNED_KB_TAG,
  buildMerchantAnswerKbTags,
  buildMerchantAnswerPlanningInstruction,
  isAgentLearnedKbArticle,
  kbTagsForDisplay,
} from "./kb-learned.js";

describe("kb-learned", () => {
  it("buildMerchantAnswerKbTags includes agent-learned, topic tags, and thread tag", () => {
    expect(buildMerchantAnswerKbTags("Support")).toEqual([AGENT_LEARNED_KB_TAG, "Support"]);
    expect(buildMerchantAnswerKbTags(null)).toEqual([AGENT_LEARNED_KB_TAG]);
    expect(buildMerchantAnswerKbTags("Support", ["shipping"])).toEqual([
      AGENT_LEARNED_KB_TAG,
      "shipping",
      "Support",
    ]);
  });

  it("isAgentLearnedKbArticle detects the agent-learned tag", () => {
    expect(isAgentLearnedKbArticle(["Support", AGENT_LEARNED_KB_TAG])).toBe(true);
    expect(isAgentLearnedKbArticle(["Support"])).toBe(false);
  });

  it("kbTagsForDisplay hides agent-learned", () => {
    expect(kbTagsForDisplay(["shipping", AGENT_LEARNED_KB_TAG])).toEqual(["shipping"]);
  });

  it("buildMerchantAnswerPlanningInstruction always includes the merchant answer", () => {
    const base = "Handle shipping question";

    expect(buildMerchantAnswerPlanningInstruction({
      baseInstruction: base,
      question: null,
      answer: "Yes",
      saveToKb: true,
    })).toBe(base);

    expect(buildMerchantAnswerPlanningInstruction({
      baseInstruction: base,
      question: "Do we ship globally?",
      answer: "Yes — $15 flat rate.",
      saveToKb: true,
    })).toContain("saved in the knowledge base");

    expect(buildMerchantAnswerPlanningInstruction({
      baseInstruction: base,
      question: "Should I comp this order?",
      answer: "Yes, comp it.",
      saveToKb: false,
    })).toContain("Use this to draft the customer reply");
    expect(buildMerchantAnswerPlanningInstruction({
      baseInstruction: base,
      question: "Should I comp this order?",
      answer: "Yes, comp it.",
      saveToKb: false,
    })).not.toContain("knowledge base");
  });

  it("buildMerchantAnswerPlanningInstruction adds the attach step for label-URL answers", () => {
    const labelInstruction = buildMerchantAnswerPlanningInstruction({
      baseInstruction: "Reply to the customer about their return.",
      question: "Can you reply with a return label URL for order #11111?",
      answer: "https://labels.example.com/rma-11111.pdf",
      saveToKb: true,
    });
    expect(labelInstruction).toContain("call attach_return_label");
    expect(labelInstruction).toContain("do NOT call create_return");

    expect(buildMerchantAnswerPlanningInstruction({
      baseInstruction: "Reply to the customer.",
      question: "Do we ship globally?",
      answer: "Yes — details at https://example.com/shipping.",
      saveToKb: true,
    })).not.toContain("attach_return_label");
  });
});
