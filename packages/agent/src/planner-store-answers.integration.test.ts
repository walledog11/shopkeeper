import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupTestData, createTestOrg } from "@shopkeeper/db/test-helpers";
import { installAgentLogger, resetAgentLoggerForTests } from "./logger.js";
import { saveStoreFact } from "./merchant-answer-kb.js";
import { planAgent } from "./planner.js";
import { merchantAnswerSlotsInCalls } from "./reply-placeholders.js";
import { AGENT_SETTINGS_DEFAULTS } from "./settings.js";
import { makeCtx, makeLogger, singleToolUse } from "./test-fixtures/planner.js";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));
vi.mock("./spend.js", () => ({
  enforceSpendCap: vi.fn().mockResolvedValue(undefined),
  recordSpend: vi.fn().mockResolvedValue(undefined),
  getDailySpendNano: vi.fn().mockResolvedValue(0),
}));
vi.mock("./agent-actions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agent-actions.js")>()),
  recordAgentTurnUsage: vi.fn().mockResolvedValue(undefined),
}));

const orgIds: string[] = [];
afterEach(async () => {
  resetAgentLoggerForTests();
  mockCreate.mockReset();
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

async function draftRefund(orgId: string) {
  mockCreate
    .mockResolvedValueOnce(singleToolUse("create_refund", { order_id: "123", amount: "10.00" }, "tu_refund"))
    .mockResolvedValueOnce(singleToolUse("send_reply", {
      text: "Your refund is on its way. It should reach you within {{refund_timing}}.",
      // A value the model invents for the blank is never kept.
      approval_refund_timing: "the same day",
    }, "tu_reply"));
  return planAgent(makeCtx({ orgId }), "Please refund my order", AGENT_SETTINGS_DEFAULTS);
}

// 2026-11-03 live run: the store's answer to "how long do refunds take?" was in
// the pre-loaded Memory, beside an older placeholder answer, and the model still
// drafted the blank, so the merchant was asked again.
describe("planAgent blanks", () => {
  it("fills a blank from the store's saved answer, never from the model", async () => {
    installAgentLogger(makeLogger());
    const org = await createTestOrg();
    orgIds.push(org.id);

    const unanswered = await draftRefund(org.id);
    expect(merchantAnswerSlotsInCalls(unanswered.rawToolCalls).map((slot) => slot.name)).toEqual(["refund_timing"]);

    await saveStoreFact({ organizationId: org.id, name: "refund_timing", answer: "1-2 business days" });
    const answered = await draftRefund(org.id);
    expect(merchantAnswerSlotsInCalls(answered.rawToolCalls)).toEqual([]);
    expect(answered.communication).toMatchObject({
      mode: "exact_draft",
      allowedResultBindings: expect.arrayContaining([
        { placeholder: "refund_timing", source: "merchant", answer: "1-2 business days" },
      ]),
    });
  });
});
