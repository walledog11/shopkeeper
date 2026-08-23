import { describe, expect, it } from "vitest";
import { decideAutonomy } from "./autonomy.js";
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
    steps: calls.filter((call) => call.name !== "search_kb").map((call) => ({
      id: call.id,
      tool: call.name,
      label: call.name,
      description: call.name,
      category: call.name === "create_refund" ? "action" : call.name === "send_reply" ? "communication" : "internal",
      enabled: true,
    })),
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
  it("gives invalidity absolute precedence", () => {
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

  it("requires a reply for mutative automatic execution", () => {
    const verdict = decideAutonomy(plan([refund]), settings());
    expect(verdict).toMatchObject({ kind: "needs_review", approvalAllowed: false });
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
});
