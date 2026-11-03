import { beforeEach, describe, expect, it, vi } from 'vitest';

const runAgent = vi.hoisted(() => vi.fn(async () => ({ summary: '', actionsPerformed: [] })));
vi.mock('@shopkeeper/agent/run', () => ({ runAgent }));
vi.mock('../../clients/agent-runtime.js', () => ({ getGatewayLockProvider: vi.fn() }));
vi.mock('../../product-analytics.js', () => ({ captureAgentActionsCompleted: vi.fn() }));
vi.mock('../support-plan/agent-thread-sink.js', () => ({ gatewayThreadSink: {} }));

import { buildGatewayTurnDeps } from './agent-turn-deps.js';

beforeEach(() => runAgent.mockClear());

// 2026-11-03 live run: the adapter copied the turn options one by one and left
// out the merchant's answer to the card's blank, so the approved refund ran and
// its reply was withheld with the blank still empty.
describe('buildGatewayTurnDeps runAgent', () => {
  it("passes the approved message and the merchant's answer to its blank to the core", async () => {
    const approvedCommunication = {
      mode: 'exact_draft' as const,
      destination: { kind: 'thread' as const, id: 'thread_1', channel: 'ig_dm' },
      draft: 'It should reach you within {{refund_timing}}.',
      allowedResultBindings: [{ placeholder: 'refund_timing' as const, source: 'merchant' as const }],
    };
    await buildGatewayTurnDeps().runAgent({} as never, 'Refund', [], {} as never, {
      approvedCommunication,
      merchantAnswers: { refund_timing: '1-2 business days' },
    });

    expect(runAgent).toHaveBeenCalledWith({}, 'Refund', [], {}, expect.objectContaining({
      approvedCommunication,
      merchantAnswers: { refund_timing: '1-2 business days' },
    }));
  });
});
