import { describe, expect, it, vi } from "vitest";
import type { ActionEntry, AgentContext } from "./agent-context.js";
import type { CompletionFact } from "./completion-facts.js";
import { executeAgentToolCall } from "./run-execution.js";

function context() {
  const sendReply = vi.fn().mockResolvedValue({ status: "ok", message: "Sent." });
  const sendEmail = vi.fn().mockResolvedValue({ status: "ok", message: "Sent." });
  const ctx: AgentContext = {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Ada", platformId: "ada@example.com" },
    recentMessages: [],
    openThreadCount: 1,
    shopify: null,
    recentOrders: [{
      id: "123",
      name: "#1001",
      created_at: "2026-09-07T00:00:00.000Z",
      financial_status: "paid",
      fulfillment_status: null,
      total_price: "20.00",
      currency: "USD",
      items: [],
      shipping_address: null,
    }],
    linkedShopifyCustomerName: "Ada",
    kbArticles: [],
    merchantPreferences: [],
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "email",
      tag: null,
      aiSummary: null,
      shopifyCustomerId: "456",
    },
    escalate: vi.fn().mockResolvedValue(undefined),
    io: {
      addInternalNote: vi.fn(),
      sendReply,
      sendEmail,
      updateThreadStatus: vi.fn(),
      updateThreadTag: vi.fn(),
    },
  };
  return { ctx, sendReply, sendEmail };
}

async function sendWithEvidence(
  text: string,
  actionsPerformed: ActionEntry[],
  completionEvidence: readonly CompletionFact[] = [],
) {
  const { ctx, sendReply } = context();
  await executeAgentToolCall({
    id: "reply_1",
    name: "send_reply",
    input: { text },
  }, {
    ctx,
    readOnly: false,
    supportThread: ctx.thread,
    actionsPerformed,
    executedToolCalls: [],
    completionEvidence,
    recordAgentFailure: vi.fn(),
    setEscalationReason: vi.fn(),
  });
  return { actionsPerformed, sendReply };
}

describe("completion grounding at execution", () => {
  it("sends exact completion copy after the matching action succeeded", async () => {
    const result = await sendWithEvidence("We refunded USD 20.00 for order #1001.", [{
      tool: "create_refund",
      toolCallId: "refund_1",
      input: { order_id: "123", amount: "20.00", currency: "USD" },
      result: "Refund of $20.00 issued successfully for order 123.",
      status: "success",
    }]);

    expect(result.sendReply).toHaveBeenCalledOnce();
    expect(result.sendReply).toHaveBeenCalledWith({
      text: "A refund of $20.00 has been issued for order #1001.",
    });
    expect(result.actionsPerformed.at(-1)).toMatchObject({ tool: "send_reply", status: "success" });
  });

  it("keeps brand voice around a deterministic completion statement", async () => {
    const result = await sendWithEvidence(
      "Thanks for your patience. I'll issue the refund now. We appreciate you.",
      [{
        tool: "create_refund",
        toolCallId: "refund_1",
        input: { order_id: "123", amount: "20.00", currency: "USD" },
        result: "Refund of $20.00 issued successfully for order 123.",
        status: "success",
      }],
    );

    expect(result.sendReply).toHaveBeenCalledWith({
      text: "Thanks for your patience. A refund of $20.00 has been issued for order #1001. We appreciate you.",
    });
    expect(result.actionsPerformed.at(-1)?.input).toEqual({
      text: "Thanks for your patience. A refund of $20.00 has been issued for order #1001. We appreciate you.",
    });
  });

  it("blocks wrong amount copy even though a refund tool succeeded", async () => {
    const result = await sendWithEvidence("We refunded $21.00 for the order.", [{
      tool: "create_refund",
      toolCallId: "refund_1",
      input: { order_id: "123", amount: "20.00", currency: "USD" },
      result: "Refund of $20.00 issued successfully for order 123.",
      status: "success",
    }]);

    expect(result.sendReply).not.toHaveBeenCalled();
    expect(result.actionsPerformed.at(-1)).toMatchObject({
      tool: "send_reply",
      status: "error",
      result: expect.stringContaining("not supported by a successful action result"),
    });
  });

  it("blocks a compound reply when only part of the work succeeded", async () => {
    const result = await sendWithEvidence("We refunded the order and opened a return.", [
      {
        tool: "create_refund",
        toolCallId: "refund_1",
        input: { order_id: "123", amount: "20.00", currency: "USD" },
        result: "Refund of $20.00 issued successfully for order 123.",
        status: "success",
      },
      {
        tool: "create_return",
        toolCallId: "return_1",
        input: { order_id: "123" },
        result: "Error: provider rejected return.",
        status: "error",
      },
    ]);

    expect(result.sendReply).not.toHaveBeenCalled();
    expect(result.actionsPerformed.at(-1)?.status).toBe("error");
  });

  it("accepts a historical fact with a live-read execution reference", async () => {
    const result = await sendWithEvidence("Your refund has been issued.", [], [{
      action: "refund",
      target: { kind: "order", id: "123", aliases: ["#1001"] },
      amount: "20.00",
      currency: "USD",
      outcome: "success",
      executionReference: "read:order_1",
      sourceTool: "get_order_by_name",
    }]);

    expect(result.sendReply).toHaveBeenCalledOnce();
    expect(result.sendReply).toHaveBeenCalledWith({
      text: "A refund of $20.00 has been issued for order #1001.",
    });
  });

  it("renders a grounded email body without changing its approved recipient or subject", async () => {
    const { ctx, sendEmail } = context();
    const actionsPerformed: ActionEntry[] = [];
    await executeAgentToolCall({
      id: "email_1",
      name: "send_email",
      input: {
        to: "ada@example.com",
        subject: "Your refund",
        body: "Good news. We've refunded your order.",
      },
    }, {
      ctx,
      readOnly: false,
      supportThread: ctx.thread,
      actionsPerformed,
      executedToolCalls: [],
      completionEvidence: [{
        action: "refund",
        target: { kind: "order", id: "123", aliases: ["#1001"] },
        amount: "20.00",
        currency: "USD",
        outcome: "success",
        executionReference: "read:order_1",
        sourceTool: "get_order_by_name",
      }],
      recordAgentFailure: vi.fn(),
      setEscalationReason: vi.fn(),
    });

    expect(sendEmail).toHaveBeenCalledWith({
      to: "ada@example.com",
      subject: "Your refund",
      body: "Good news. A refund of $20.00 has been issued for order #1001.",
    });
  });
});

// Overhaul plan, Next work item 4 (decisions A and B, case D18): an approved
// exact draft is sent as approved, placeholders filled from receipts, and is
// never rendered, re-judged or rejected for its wording.
describe("approved exact drafts at execution", () => {
  const refundReceipt = {
    version: 1 as const,
    operationId: "operation-1",
    executionId: "execution-1",
    tool: "create_refund" as const,
    target: { kind: "order", id: "123" },
    observedAt: "2026-09-25T07:00:00.000Z",
    outcome: "succeeded" as const,
    providerReference: "refund-1",
    facts: {
      orderId: "123",
      refundId: "refund-1",
      amount: "18.40",
      currency: "USD",
      transactionStatus: "SUCCESS",
      transactionReference: "transaction-1",
      classification: "partial" as const,
    },
  };

  function refundAction(overrides: Partial<ActionEntry> = {}): ActionEntry {
    return {
      tool: "create_refund",
      toolCallId: "refund_1",
      input: { order_id: "123" },
      result: "Refund of $20.00 issued successfully for order 123.",
      status: "success",
      receipt: refundReceipt,
      ...overrides,
    };
  }

  async function sendApproved(
    draft: string,
    actionsPerformed: ActionEntry[],
    options: { sentText?: string; bindings?: boolean; writeCallIds?: string[] } = {},
  ) {
    const { ctx, sendReply } = context();
    await executeAgentToolCall({
      id: "reply_1",
      name: "send_reply",
      input: { text: options.sentText ?? draft },
    }, {
      ctx,
      readOnly: false,
      supportThread: ctx.thread,
      actionsPerformed,
      executedToolCalls: [],
      approvedMessage: {
        communication: {
          mode: "exact_draft",
          destination: { kind: "thread", id: "thread_1", channel: "email" },
          draft,
          allowedResultBindings: options.bindings
            ? [{ placeholder: "refund_amount", toolCallId: "refund_1", tool: "create_refund", field: "facts.amount" }]
            : [],
        },
        writeCallIds: options.writeCallIds ?? actionsPerformed.map((action) => action.toolCallId!),
      },
      recordAgentFailure: vi.fn(),
      setEscalationReason: vi.fn(),
    });
    return { actionsPerformed, sendReply };
  }

  it("sends the approved words unchanged where the legacy renderer would rewrite them", async () => {
    const draft = "We refunded USD 20.00 for order #1001.";
    const result = await sendApproved(draft, [refundAction()]);

    expect(result.sendReply).toHaveBeenCalledWith({ text: draft });
    expect(result.actionsPerformed.at(-1)).toMatchObject({ status: "success", input: { text: draft } });
  });

  // Gate C run 3: a true reply backed by an address-update receipt was rejected
  // for its phrasing.
  it("sends a true reply whose phrasing the legacy prose check rejects", async () => {
    const draft = "Your shipping address for order #1001 has been updated to 12 Elm St.";
    const result = await sendApproved(draft, [{
      tool: "update_shopify_order_address",
      toolCallId: "address_1",
      input: { order_id: "123" },
      result: "Address updated.",
      status: "success",
    }]);

    expect(result.sendReply).toHaveBeenCalledWith({ text: draft });
  });

  it("fills a placeholder from the approved write's receipt and nothing else", async () => {
    const result = await sendApproved(
      "Hi Ada, we refunded {{refund_amount}} to your card.",
      [refundAction()],
      { bindings: true },
    );

    expect(result.sendReply).toHaveBeenCalledWith({ text: "Hi Ada, we refunded $18.40 to your card." });
  });

  it("does not send when the bound write left only a result string (D18)", async () => {
    const result = await sendApproved(
      "We refunded {{refund_amount}}.",
      [refundAction({ receipt: undefined })],
      { bindings: true },
    );

    expect(result.sendReply).not.toHaveBeenCalled();
    expect(result.actionsPerformed.at(-1)).toMatchObject({
      tool: "send_reply",
      status: "error",
      result: expect.stringContaining("refund_amount placeholder"),
    });
  });

  it("does not send when an approved write did not succeed", async () => {
    const result = await sendApproved("Your refund is on its way.", [refundAction({ status: "error", receipt: undefined })]);

    expect(result.sendReply).not.toHaveBeenCalled();
    expect(result.actionsPerformed.at(-1)?.result).toContain("an approved action did not succeed");
  });

  it("does not send ahead of an approved write that has not run", async () => {
    const result = await sendApproved("Your refund is on its way.", [], { writeCallIds: ["refund_1"] });

    expect(result.sendReply).not.toHaveBeenCalled();
  });

  it("does not send a message that is not the approved draft", async () => {
    const result = await sendApproved("Your refund is on its way.", [refundAction()], {
      sentText: "Your refund is on its way!",
    });

    expect(result.sendReply).not.toHaveBeenCalled();
    expect(result.actionsPerformed.at(-1)?.result).toContain("not the message the merchant approved");
  });
});
