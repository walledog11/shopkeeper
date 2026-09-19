import { describe, expect, it } from "vitest";
import { decideAutonomy } from "./autonomy.js";
import { buildPlanSteps } from "./planner-steps.js";
import { resolveAgentSettings } from "./settings.js";
import type { AgentPlan, OrgSettings, RawToolCall } from "./types.js";

const reply: RawToolCall = { id: "reply", name: "send_reply", input: { text: "Done." } };
const refund: RawToolCall = {
  id: "refund",
  name: "create_refund",
  input: { order_id: "1", amount: "10.00", reason: "requested" },
};

function plan(calls: RawToolCall[], overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    instruction: "Handle it",
    rawToolCalls: calls,
    // The production step builder, not a local imitation of it: read tools are
    // absent from a plan's steps, and the quick-reply shape is decided on that.
    steps: buildPlanSteps(calls),
    validation: { status: "valid", issues: [] },
    routingEvidence: { classifierState: "aligned", codes: [] },
    ...overrides,
  };
}

function settings(overrides: Partial<OrgSettings> = {}): OrgSettings {
  return resolveAgentSettings({
    autonomyTier: "trusted",
    autoExecuteMode: "live",
    ...overrides,
  });
}

describe("decideAutonomy", () => {
  it("outranks a model-authored escalation with invalidity", () => {
    const verdict = decideAutonomy(plan([{
      id: "esc",
      name: "escalate_to_human",
      input: { reason: "Human" },
    }], {
      validation: {
        status: "invalid",
        issues: [{ code: "invalid_tool_input", message: "bad" }],
      },
    }), settings());
    expect(verdict.kind).toBe("invalid");
  });

  // Evidence read off the merchant's own orders cannot be cancelled by the
  // model writing a plan bad enough to fail validation.
  it("lets structural escalation evidence outrank an invalid proposal", () => {
    const verdict = decideAutonomy(plan([
      { id: "note", name: "add_internal_note", input: { text: "Prior refund on file." } },
      reply,
    ], {
      validation: {
        status: "invalid",
        issues: [{ code: "orphan_internal_note", message: "orphan" }],
      },
      routingEvidence: {
        classifierState: "aligned",
        codes: ["already_refunded_request"],
        escalationReason: "Refund requested for an order that is already fully refunded — needs human review.",
      },
    }), settings());
    expect(verdict.kind).toBe("escalate");
    if (verdict.kind === "escalate") {
      expect(verdict.reasons).toEqual(["already_refunded_request"]);
      expect(verdict.escalationReason).toContain("already fully refunded");
    }
  });

  it("selects the human-only escalation side effect", () => {
    const escalate = { id: "esc", name: "escalate_to_human", input: { reason: "Human" } };
    const verdict = decideAutonomy(plan([escalate]), settings());
    expect(verdict.kind).toBe("escalate");
    if (verdict.kind === "escalate") expect(verdict.toolCalls).toEqual([escalate]);
  });

  it("parks explicit merchant questions before sender and signal checks", () => {
    const verdict = decideAutonomy(plan([{
      id: "ask",
      name: "ask_operator",
      input: { question: "Which policy applies?" },
    }]), settings(), { filterStatus: "questionable" });
    expect(verdict.kind).toBe("needs_merchant_input");
  });

  it.each(["missing", "unaligned"] as const)("fails closed for %s classifier evidence", (classifierState) => {
    const verdict = decideAutonomy(plan([reply], {
      routingEvidence: { classifierState, codes: [] },
    }), settings());
    expect(verdict).toMatchObject({ kind: "needs_review", approvalAllowed: true });
  });

  it("requires review for questionable senders", () => {
    expect(decideAutonomy(plan([reply]), settings(), { filterStatus: "questionable" }).kind)
      .toBe("needs_review");
  });

  it("requires review for blocking plan signals", () => {
    const verdict = decideAutonomy(plan([reply], {
      signals: [{ code: "order_not_found", severity: "blocking", message: "missing" }],
    }), settings());
    expect(verdict.kind).toBe("needs_review");
  });

  it("makes disabled communication tools non-approvable", () => {
    const verdict = decideAutonomy(plan([reply]), settings({
      toolsEnabled: { action: true, communication: false, internal: true, read: true },
    }));
    expect(verdict).toMatchObject({
      kind: "needs_review",
      approvalAllowed: false,
      reasons: ["static_policy_block"],
    });
  });

  it("keeps disabled tools non-approvable when another review reason also applies", () => {
    const disabled = settings({
      toolsEnabled: { action: true, communication: false, internal: true, read: true },
    });
    expect(decideAutonomy(plan([reply]), disabled, { filterStatus: "questionable" }))
      .toMatchObject({ kind: "needs_review", approvalAllowed: false, reasons: ["static_policy_block"] });
    expect(decideAutonomy(plan([reply], {
      signals: [{ code: "order_not_found", severity: "blocking", message: "missing" }],
    }), disabled)).toMatchObject({ kind: "needs_review", approvalAllowed: false });
  });

  it("makes disabled internal tools non-approvable", () => {
    const internal: RawToolCall = {
      id: "status",
      name: "update_thread_status",
      input: { status: "closed" },
    };
    const verdict = decideAutonomy(plan([internal]), settings({
      toolsEnabled: { action: true, communication: true, internal: false, read: true },
    }));
    expect(verdict).toMatchObject({ kind: "needs_review", approvalAllowed: false });
  });

  it("blocks policy-disabled mutations from approval", () => {
    const verdict = decideAutonomy(plan([refund, reply]), settings({ maxRefundAmount: 5 }));
    expect(verdict).toMatchObject({ kind: "needs_review", approvalAllowed: false });
  });

  it("lets structural escalation evidence replace a policy-blocked proposal", () => {
    const verdict = decideAutonomy(plan([refund, reply], {
      routingEvidence: {
        classifierState: "aligned",
        codes: ["compensation_over_cap"],
        escalationReason: "Compensation above the workspace limit was planned — needs human review.",
      },
    }), settings({ maxRefundAmount: 5 }));
    expect(verdict).toMatchObject({
      kind: "escalate",
      reasons: ["compensation_over_cap"],
      toolCalls: [],
    });
  });

  it("requires a reply for mutative automatic execution", () => {
    const verdict = decideAutonomy(plan([refund]), settings());
    expect(verdict).toMatchObject({ kind: "needs_review", approvalAllowed: false });
  });

  // Package 3, step 4: a plan that suspended at its proposal composes the reply
  // from the receipt, so the same draft-less shape is decided on its merits
  // instead. Required approval and automatic permission are separate cases, and
  // the model having proposed the refund decides neither of them.
  describe("a proposal that composes from the receipt", () => {
    const suspended = (overrides: Partial<OrgSettings> = {}) =>
      decideAutonomy(plan([refund], { suspendedAtProposal: true }), settings(overrides));

    it("is approvable by the merchant when the tier requires review", () => {
      expect(suspended({ autonomyTier: "guarded" })).toMatchObject({
        kind: "needs_review",
        reasons: ["tier_requires_review"],
        approvalAllowed: true,
        toolCalls: [refund],
      });
    });

    it("runs without a human when the existing rules already permit the mutation", () => {
      const verdict = suspended();
      expect(verdict.kind).toBe("auto_execute");
      if (verdict.kind === "auto_execute") {
        expect(verdict.toolCalls).toEqual([refund]);
        expect(verdict.replyText).toBeNull();
        expect(verdict.sendReplyToolCall).toBeNull();
      }
    });

    it("is still held by the rollout, business-hours and policy rules", () => {
      expect(suspended({ autoExecuteMode: "off" })).toMatchObject({
        kind: "needs_review",
        reasons: ["auto_execute_rollout_disabled"],
        approvalAllowed: true,
      });
      expect(decideAutonomy(
        plan([refund], { suspendedAtProposal: true }),
        settings(),
        { allowMutativeAutoExecute: false },
      )).toMatchObject({ kind: "needs_review", reasons: ["outside_business_hours"] });
      expect(suspended({ maxRefundAmount: 5 })).toMatchObject({
        kind: "needs_review",
        reasons: ["static_policy_block"],
        approvalAllowed: false,
      });
    });
  });

  it("honors rollout and business-hours gates", () => {
    expect(decideAutonomy(plan([refund, reply]), settings({ autoExecuteMode: "off" })))
      .toMatchObject({ kind: "needs_review", reasons: ["auto_execute_rollout_disabled"] });
    expect(decideAutonomy(plan([refund, reply]), settings(), { allowMutativeAutoExecute: false }))
      .toMatchObject({ kind: "needs_review", reasons: ["outside_business_hours"] });
  });

  it("auto-executes eligible mutations and carries exact selected calls", () => {
    const verdict = decideAutonomy(plan([refund, reply]), settings());
    expect(verdict.kind).toBe("auto_execute");
    if (verdict.kind === "auto_execute") expect(verdict.toolCalls).toEqual([refund, reply]);
  });

  it("recognizes only the exact safe quick-reply shape", () => {
    const verdict = decideAutonomy(plan([reply]), settings());
    expect(verdict).toMatchObject({ kind: "quick_reply", toolCalls: [reply] });
    const fallback = decideAutonomy(plan([
      { id: "note", name: "add_internal_note", input: { text: "note" } },
      reply,
    ]), settings());
    expect(fallback.kind).toBe("needs_review");
  });

  // The shipping read an unverified sender is answered from. It discloses
  // nothing about the person on the order, so it leaves the unresolved-customer
  // signal advisory — and it has to be a recognized quick-reply read too, or the
  // answer it exists to make possible still costs the merchant an approval.
  it("sends a shipping-status answer for a customer it could not resolve", () => {
    const status: RawToolCall = {
      id: "status",
      name: "get_order_fulfillment_status",
      input: { order_number: "#1032" },
    };
    const verdict = decideAutonomy(plan([status, reply], {
      signals: [{
        code: "shopify_customer_unresolved",
        severity: "advisory",
        message: "Couldn't find a Shopify customer.",
      }],
    }), settings());
    expect(verdict).toMatchObject({ kind: "quick_reply", toolCalls: [reply] });
  });

  it("still routes the fuller order read for that customer to the merchant", () => {
    const lookup: RawToolCall = {
      id: "lookup",
      name: "get_order_by_name",
      input: { order_name: "#1032" },
    };
    const verdict = decideAutonomy(plan([lookup, reply], {
      signals: [{
        code: "shopify_customer_unresolved",
        severity: "blocking",
        message: "Couldn't find a Shopify customer.",
      }],
    }), settings());
    expect(verdict).toMatchObject({
      kind: "needs_review",
      reasons: ["shopify_customer_unresolved"],
    });
  });
});
