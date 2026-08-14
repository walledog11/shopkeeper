import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

// `senderId` is unique across every org, and test files run in parallel forks
// against one database — a hardcoded number collides with whichever other file
// claims it first.
const SENDER_ID = `+1555${randomUUID().replace(/\D/g, '').padEnd(7, '0').slice(0, 7)}`;

// One durable operator thread per *person* (Phase 2), with notifications and the
// merchant's texts mirrored onto it. The core turn, billing gate, lock deps, and
// transport send are the only host seams stubbed — resolveOperatorThread, the
// pending queue, and the mirror run against the real test DB.
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

import { memberOperatorKey, resolveOperatorThread } from '@shopkeeper/agent/internal-thread';
import { executeOperatorAgentTurn } from './message-handlers/execute-operator-agent-turn.js';
import { getContext } from './operator-context.js';
import { resolveOperatorMemberKey } from './operator-identity.js';
import { notifyOperator } from './operator-notify.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

async function createMember(clerkUserId: string) {
  return db.orgMember.create({ data: { organizationId: org.id, clerkUserId } });
}

beforeEach(async () => {
  org = await createTestOrg();
  vi.clearAllMocks();
  telegramSendSpy.mockResolvedValue(true);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('operator thread consolidation', () => {
  it('lands two free-form texts from one person on a single thread', async () => {
    const memberKey = await resolveOperatorMemberKey(org.id, 'usr_1');
    const first = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'where is order #1001?',
      operatorKey: memberKey,
      clerkUserId: 'usr_1',
    });
    const second = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'and #1002?',
      operatorKey: memberKey,
      clerkUserId: 'usr_1',
    });

    expect(second.threadId).toBe(first.threadId);
    const threads = await db.thread.findMany({
      where: { organizationId: org.id, operatorKey: memberKey },
    });
    expect(threads).toHaveLength(1);
    expect(threads[0].channelType).toBe('sms_agent');
  });

  // The Phase 2 payoff: two transports, one conversation. Both bindings resolve
  // the same Clerk user, so texting from the phone and typing in the Concierge
  // continue the same thread rather than forking two memories.
  it('lands both of one person\'s transports on the same thread', async () => {
    const member = await createMember('usr_multi');
    await db.orgMemberTelegramChat.create({ data: { orgMemberId: member.id, chatId: '900900' } });
    await db.orgMemberImessageBinding.create({
      data: { orgMemberId: member.id, senderId: SENDER_ID, spaceId: 'space_1' },
    });

    const fromPhone = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'x',
      operatorKey: await resolveOperatorMemberKey(org.id, 'usr_multi'),
      senderPhone: `imessage:${SENDER_ID}`,
      clerkUserId: 'usr_multi',
    });
    const fromDesk = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'y',
      operatorKey: await resolveOperatorMemberKey(org.id, 'usr_multi'),
      clerkUserId: 'usr_multi',
    });

    expect(fromDesk.threadId).toBe(fromPhone.threadId);
    const threads = await db.thread.findMany({
      where: { organizationId: org.id, channelType: 'sms_agent' },
    });
    expect(threads).toHaveLength(1);
    expect(threads[0].operatorKey).toBe(memberOperatorKey(member.id));
  });

  it('gives two teammates two separate threads', async () => {
    const a = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'x',
      operatorKey: await resolveOperatorMemberKey(org.id, 'usr_1'),
      clerkUserId: 'usr_1',
    });
    const b = await executeOperatorAgentTurn({
      orgId: org.id,
      instruction: 'y',
      operatorKey: await resolveOperatorMemberKey(org.id, 'usr_2'),
      clerkUserId: 'usr_2',
    });

    expect(b.threadId).not.toBe(a.threadId);
    const threads = await db.thread.findMany({
      where: { organizationId: org.id, channelType: 'sms_agent' },
    });
    expect(threads).toHaveLength(2);
  });

  it('mirrors a plan notification onto the member thread as an agent message', async () => {
    const member = await createMember('usr_notify');
    const body = 'Proposed plan (2 steps): refund #1002';
    const result = await notifyOperator(
      org.id,
      { channel: 'telegram', orgMemberId: member.id, chatId: '900900' },
      body,
      { pendingPlan: null },
    );

    expect(result).toEqual({ channel: 'telegram', chatId: '900900' });
    expect(telegramSendSpy).toHaveBeenCalledTimes(1);

    const thread = await resolveOperatorThread(org.id, memberOperatorKey(member.id));
    const messages = await db.message.findMany({
      where: { threadId: thread.id, senderType: 'agent' },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].contentText).toBe(body);
  });

  // Two live views of one queue: a card fanned out to the phone must be the same
  // parked plan the desk reads, or approving in one place leaves the other still
  // offering it.
  it('parks one plan for a person no matter which binding delivered the card', async () => {
    const member = await createMember('usr_queue');
    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'queue-ticket@example.com' },
    });
    const ticket = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: 'email',
        status: 'open',
      },
    });
    const plan = { threadId: ticket.id, instruction: 'refund #1002', rawToolCalls: [] };

    for (const binding of [
      { channel: 'telegram' as const, orgMemberId: member.id, chatId: '900900' },
      { channel: 'telegram' as const, orgMemberId: member.id, chatId: '900901' },
    ]) {
      await notifyOperator(org.id, binding, 'Proposed plan', {}, {
        appendPlan: { plan, maxDepth: 5 },
      });
    }

    const context = await getContext(org.id, memberOperatorKey(member.id));
    expect(context.pendingPlans).toHaveLength(1);
    expect(context.pendingPlan?.threadId).toBe(ticket.id);
  });
});
