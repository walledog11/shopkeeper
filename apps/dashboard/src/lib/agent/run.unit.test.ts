import { describe, expect, it, vi } from "vitest";
import type { BaseAgentContext } from "@shopkeeper/agent/context";

const { mockCoreRunAgent, mockRecordAgentFailure } = vi.hoisted(() => ({
  mockCoreRunAgent: vi.fn().mockResolvedValue({ summary: "ok", actionsPerformed: [] }),
  mockRecordAgentFailure: vi.fn().mockResolvedValue({ emitted: false }),
}));

vi.mock("@shopkeeper/agent/run", () => ({
  runAgent: mockCoreRunAgent,
}));

vi.mock("@/lib/server/agent-failure-alerts", () => ({
  recordAgentFailure: mockRecordAgentFailure,
}));

import { runAgent } from "./run";

function makeCtx(): BaseAgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customerMemory: null,
    recentMessages: [],
    shopify: null,
    escalate: vi.fn().mockResolvedValue(undefined),
  };
}

describe("dashboard runAgent host wrapper", () => {
  it("injects dashboard failure alerting when a counter client is provided", async () => {
    const counterClient = {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(undefined),
    };

    await runAgent(makeCtx(), "Reply", undefined, undefined, {
      failureRoute: "/api/agent",
      failureCounterClient: counterClient,
    });

    const options = mockCoreRunAgent.mock.calls[0][4];
    await options.recordToolFailure("tool_result", "send_reply", "Error: provider failed.");

    expect(mockRecordAgentFailure).toHaveBeenCalledWith(
      {
        kind: "tool_result",
        route: "/api/agent",
        orgId: "org_1",
        tool: "send_reply",
        detail: "Error: provider failed.",
      },
      { counterClient },
    );
  });

  it("omits failure alerting when no counter client is available", async () => {
    await runAgent(makeCtx(), "Reply");

    const options = mockCoreRunAgent.mock.calls.at(-1)?.[4];

    expect(options.recordToolFailure).toBeUndefined();
  });
});
