import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

// Phase B: one durable operator thread per binding, with notifications and the
// merchant's texts mirrored onto it. The core turn, billing gate, lock deps, and
// transport send are the only host seams stubbed — resolveOperatorThread and the
// mirror run against the real test DB.
const {
  mockExecuteAgentTurn,
  mockAssertBilling,
  mockResolveApprover,
  mockBuildDeps,
  telegramSendSpy,
} = vi.hoisted(() => ({
  mockExecuteAgentTurn: vi.fn().mockResolvedValue({ summary: 'On it.', actionsPerformed: [] }),
  mockAssertBilling: vi.fn().mockResolvedValue(undefined),
  mockResolveApprover: vi.fn().mockResolvedValue({ clerkUserId: 'u', displayName: 'Owner' }),
  mockBuildDeps: vi.fn(() => ({ lock: {}, buildContext: vi.fn(), runAgent: vi.fn() })),
  telegramSendSpy: vi.fn().mockResolvedValue(true),
}));

vi.mock('@shopkeeper/agent/turn', () => ({ executeAgentTurn: mockExecuteAgentTurn }));
vi.mock('./billing/write-gate.js', () => ({ assertBillingWriteAllowedForOrgId: mockAssertBilling }));
vi.mock('./clients/clerk-approver.js', () => ({ resolveClerkUserApprover: mockResolveApprover }));
vi.mock('./message-handlers/agent-turn-deps.js', () => ({ buildGatewayTurnDeps: mockBuildDeps }));
vi.mock('./clients/telegram-client.js', () => ({
  isTelegramConfigured: vi.fn(() => true),
  sendMessage: telegramSendSpy,
}));

import { resolveOperatorThread } from '@shopkeeper/agent/internal-thread';
import { executeOperatorAgentTurn } from './message-handlers/execute-operator-agent-turn.js';
import { notifyOperator } from './operator-notify.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.clearAllMocks();
  telegramSendSpy.mockResolvedValue(true);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('operator thread consolidation (Phase B)', () => {
  it('lands two free-form texts from one binding on a single thread', async () => {
    const first = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'where is order #1001?',
      operatorKey: 'imessage:+15550001111',
      senderPhone: 'imessage:+15550001111',
      clerkUserId: 'usr_1',
    });
    const second = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'and #1002?',
      operatorKey: 'imessage:+15550001111',
      senderPhone: 'imessage:+15550001111',
      clerkUserId: 'usr_1',
    });

    expect(second.threadId).toBe(first.threadId);
    const threads = await db.thread.findMany({
      where: { organizationId: org.id, operatorKey: 'imessage:+15550001111' },
    });
    expect(threads).toHaveLength(1);
    expect(threads[0].channelType).toBe('sms_agent');
  });

  it('gives two bindings two separate threads', async () => {
    const a = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'x',
      operatorKey: 'imessage:+15550001111',
      senderPhone: 'imessage:+15550001111',
      clerkUserId: 'usr_1',
    });
    const b = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'y',
      operatorKey: 'telegram:900900',
      senderPhone: 'telegram:900900',
      clerkUserId: 'usr_2',
    });

    expect(b.threadId).not.toBe(a.threadId);
    const threads = await db.thread.findMany({
      where: { organizationId: org.id, channelType: 'sms_agent' },
    });
    expect(threads).toHaveLength(2);
  });

  it('mirrors a plan notification onto the binding thread as an agent message', async () => {
    const body = 'Proposed plan (2 steps): refund #1002';
    const result = await notifyOperator(
      org.id,
      { channel: 'telegram', chatId: '900900' },
      body,
      { pendingPlan: null },
    );

    expect(result).toEqual({ channel: 'telegram', chatId: '900900' });
    expect(telegramSendSpy).toHaveBeenCalledTimes(1);

    const thread = await resolveOperatorThread(org.id, 'telegram:900900');
    const messages = await db.message.findMany({
      where: { threadId: thread.id, senderType: 'agent' },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].contentText).toBe(body);
  });
});
