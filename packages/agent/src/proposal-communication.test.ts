import { describe, expect, it } from "vitest";
import { hashPlan } from "./agent-actions.js";
import { readAgentPlanCacheRecordShape, AGENT_PLAN_CACHE_VERSION } from "./plan-cache-shape.js";
import {
  communicationColumns,
  communicationFromColumns,
  deriveProposalCommunication,
  planCommunication,
} from "./proposal-communication.js";
import type { ProposalCommunication, RawToolCall } from "./types.js";

const thread = { id: "thread-1", channelType: "email" };
const refund: RawToolCall = { id: "refund", name: "create_refund", input: { order_id: "1" } };
const reply: RawToolCall = { id: "reply", name: "send_reply", input: { text: "Your refund is on its way." } };
const email: RawToolCall = {
  id: "email",
  name: "send_email",
  input: { to: "jane@example.com", subject: "Your order", body: "It ships Monday." },
};
const exact: ProposalCommunication = {
  mode: "exact_draft",
  destination: { kind: "thread", id: "thread-1", channel: "email" },
  draft: "Your refund is on its way.",
  allowedResultBindings: [],
};

describe("deriveProposalCommunication", () => {
  it("binds the one customer message and where it goes", () => {
    expect(deriveProposalCommunication([refund, reply], thread)).toEqual(exact);
    expect(deriveProposalCommunication([email], thread)).toEqual({
      mode: "exact_draft",
      destination: { kind: "email", id: "jane@example.com" },
      draft: "It ships Monday.",
      allowedResultBindings: [],
    });
  });

  it("authorizes no message when the calls send none", () => {
    expect(deriveProposalCommunication([refund], thread)).toEqual({ mode: "none" });
  });

  it("cannot represent two messages or a malformed one", () => {
    expect(deriveProposalCommunication([reply, email], thread)).toBeNull();
    expect(deriveProposalCommunication([{ ...reply, input: { text: "  " } }], thread)).toBeNull();
  });

  it("binds each placeholder to the approved call that fills it", () => {
    const withAmount = { ...reply, input: { text: "We refunded {{refund_amount}}." } };
    expect(deriveProposalCommunication([refund, withAmount], thread)).toEqual({
      ...exact,
      draft: "We refunded {{refund_amount}}.",
      allowedResultBindings: [
        { placeholder: "refund_amount", toolCallId: "refund", tool: "create_refund", field: "facts.amount" },
      ],
    });
  });

  it("cannot represent a placeholder no single approved call can fill", () => {
    const withAmount = { ...reply, input: { text: "We refunded {{refund_amount}}." } };
    expect(deriveProposalCommunication([withAmount], thread)).toBeNull();
    expect(deriveProposalCommunication([refund, { ...refund, id: "refund-2" }, withAmount], thread)).toBeNull();
  });
});

describe("planCommunication", () => {
  it("reads a plan cached before the snapshot, which stopped at its write, as authorizing none", () => {
    expect(planCommunication({ suspendedAtProposal: true })).toEqual({ mode: "none" });
    expect(planCommunication({})).toBeNull();
    expect(planCommunication({ communication: exact })).toBe(exact);
  });
});

describe("proposal identity", () => {
  const base = { instruction: "Refund it", rawToolCalls: [refund, reply] };

  it("changes when the draft or its destination changes", () => {
    const hash = hashPlan({ ...base, communication: exact });
    expect(hashPlan({ ...base, communication: { ...exact, draft: "Refunded." } })).not.toBe(hash);
    expect(hashPlan({
      ...base,
      communication: { ...exact, destination: { kind: "thread", id: "thread-2", channel: "email" } },
    })).not.toBe(hash);
    expect(hashPlan({ ...base, communication: { ...exact } })).toBe(hash);
  });

  it("changes when a placeholder's binding changes", () => {
    const binding = { placeholder: "refund_amount" as const, toolCallId: "refund", tool: "create_refund", field: "facts.amount" };
    const bound: ProposalCommunication = { ...exact, allowedResultBindings: [binding] };
    expect(hashPlan({ ...base, communication: bound }))
      .not.toBe(hashPlan({ ...base, communication: { ...bound, allowedResultBindings: [{ ...binding, toolCallId: "other" }] } }));
  });

  it("hashes a proposal that authorizes no message as it did before the snapshot", () => {
    expect(hashPlan({ ...base, communication: { mode: "none" } })).toBe(hashPlan(base));
  });
});

describe("proposal columns", () => {
  it("round-trips an exact draft and leaves a none proposal's columns null", () => {
    const columns = communicationColumns(exact);
    expect(communicationFromColumns({ ...columns } as Parameters<typeof communicationFromColumns>[0]))
      .toEqual(exact);
    expect(communicationColumns({ mode: "none" })).toEqual({});
    expect(communicationFromColumns({
      communicationMode: null, communicationDestination: null, approvedDraft: null, allowedResultBindings: null,
    })).toEqual({ mode: "none" });
  });

  it("refuses a row this runtime cannot execute", () => {
    expect(communicationFromColumns({
      communicationMode: "intent", communicationDestination: null, approvedDraft: null, allowedResultBindings: null,
    })).toBeNull();
    expect(communicationFromColumns({
      communicationMode: "exact_draft",
      communicationDestination: exact.mode === "exact_draft" ? exact.destination : null,
      approvedDraft: "Refunded.",
      allowedResultBindings: [{ field: "amount" }],
    })).toBeNull();
  });
});

describe("plan cache", () => {
  const record = (communication: unknown) => ({
    version: AGENT_PLAN_CACHE_VERSION,
    planId: "plan-1",
    instruction: "Refund it",
    lastCustomerMessageId: "message-1",
    settingsFingerprint: "fingerprint",
    plan: {
      instruction: "Refund it",
      steps: [],
      rawToolCalls: [refund, reply],
      validation: { status: "valid", issues: [] },
      routingEvidence: { classifierState: "not_applicable", codes: [] },
      communication,
    },
  });

  it("keeps a valid snapshot and rejects a malformed one", () => {
    expect(readAgentPlanCacheRecordShape(record(exact))?.plan.communication).toEqual(exact);
    expect(readAgentPlanCacheRecordShape(record({ mode: "exact_draft", draft: "Hi" }))).toBeNull();
  });
});
