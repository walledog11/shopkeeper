import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ChannelType, SpendCapError, db, usdToNanoDollars } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';

const { sendMessageSpy, executeAgentTurnSpy } = vi.hoisted(() => ({
  sendMessageSpy: vi.fn().mockResolvedValue(true),
  executeAgentTurnSpy: vi.fn(),
}));

vi.mock('../clients/telegram-client.js', () => ({
  isTelegramConfigured: vi.fn(() => true),
  sendMessage: sendMessageSpy,
  setWebhook: vi.fn(),
}));

// Only the model turn is stubbed — the billing gate, thread resolution, ledger,
// and module tools all run against the real database.
vi.mock('@shopkeeper/agent/turn', () => ({
  executeAgentTurn: executeAgentTurnSpy,
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
  }),
}));

import { registerInternalOperatorRoutes } from './internal-operator.js';
import { getContext, updateContext } from '../operator-context.js';
import { resolveOperatorMemberKey } from '../operator-identity.js';

function createApp() {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerInternalOperatorRoutes(router);
  app.use('/internal', router);
  return app;
}

const SECRET = 'test-internal-secret-abc123'; // gitleaks:allow
const app = createApp();
let org!: Awaited<ReturnType<typeof createTestOrg>>;
const originalSecret = process.env.INTERNAL_API_SECRET;
const originalDashboardUrl = process.env.DASHBOARD_URL;

beforeEach(async () => {
  process.env.INTERNAL_API_SECRET = SECRET;
  process.env.DASHBOARD_URL = 'http://dashboard.test';
  sendMessageSpy.mockClear();
  executeAgentTurnSpy.mockReset();
  executeAgentTurnSpy.mockResolvedValue({
    summary: 'Nothing urgent.',
    actionsPerformed: [],
  });
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  if (originalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = originalSecret;
  if (originalDashboardUrl === undefined) delete process.env.DASHBOARD_URL;
  else process.env.DASHBOARD_URL = originalDashboardUrl;
});

describe('POST /internal/operator/escalate', () => {
  it('returns 401 when x-internal-secret is missing', async () => {
    const customer = await createTestCustomer(org.id, 'no-auth@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await request(app)
      .post('/internal/operator/escalate')
      .send({ organizationId: org.id, threadId: thread.id, reason: 'why' });

    expect(res.status).toBe(401);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('returns 401 when x-internal-secret is wrong', async () => {
    const customer = await createTestCustomer(org.id, 'bad-auth@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await request(app)
      .post('/internal/operator/escalate')
      .set('x-internal-secret', 'wrong-secret')
      .send({ organizationId: org.id, threadId: thread.id, reason: 'why' });

    expect(res.status).toBe(401);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('returns notified: 0 when no bound operators exist', async () => {
    const customer = await createTestCustomer(org.id, 'no-members@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await request(app)
      .post('/internal/operator/escalate')
      .set('x-internal-secret', SECRET)
      .send({ organizationId: org.id, threadId: thread.id, reason: 'wholesale' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notified: 0 });
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('returns 404 when the thread does not exist', async () => {
    const res = await request(app)
      .post('/internal/operator/escalate')
      .set('x-internal-secret', SECRET)
      .send({
        organizationId: org.id,
        threadId: '00000000-0000-0000-0000-000000000000',
        reason: 'nope',
      });

    expect(res.status).toBe(404);
  });

  it('pushes the escalation to every bound operator', async () => {
    const customer = await createTestCustomer(org.id, 'two-members@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const member1 = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-1` },
    });
    const member2 = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-2` },
    });
    await db.orgMemberTelegramChat.createMany({
      data: [
        { orgMemberId: member1.id, chatId: `chat-${org.id}-1` },
        { orgMemberId: member2.id, chatId: `chat-${org.id}-2` },
      ],
    });

    const res = await request(app)
      .post('/internal/operator/escalate')
      .set('x-internal-secret', SECRET)
      .send({
        organizationId: org.id,
        threadId: thread.id,
        reason: 'Wholesale pricing question.',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notified: 2 });
    expect(sendMessageSpy).toHaveBeenCalledTimes(2);

    const bodyArg = sendMessageSpy.mock.calls[0][1] as string;
    expect(bodyArg).toContain('Escalated');
    expect(bodyArg).toContain('Wholesale pricing question.');
    expect(bodyArg).toContain(`/dashboard/tickets/${thread.id}`);
  });

  it('does not count a failed send but still returns 200 when Telegram send fails for a bound operator', async () => {
    const customer = await createTestCustomer(org.id, 'send-fail@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-fail` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId: `chat-${org.id}-fail` },
    });

    sendMessageSpy.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/internal/operator/escalate')
      .set('x-internal-secret', SECRET)
      .send({
        organizationId: org.id,
        threadId: thread.id,
        reason: 'Needs human review',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notified: 0 });
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
  });

  it('still notifies the other bound operators when one send fails', async () => {
    const customer = await createTestCustomer(org.id, 'partial-fail@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const failingMember = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-partial-fail` },
    });
    const okMember = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `user-${org.id}-partial-ok` },
    });
    await db.orgMemberTelegramChat.createMany({
      data: [
        { orgMemberId: failingMember.id, chatId: `chat-${org.id}-partial-fail` },
        { orgMemberId: okMember.id, chatId: `chat-${org.id}-partial-ok` },
      ],
    });

    sendMessageSpy.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/internal/operator/escalate')
      .set('x-internal-secret', SECRET)
      .send({
        organizationId: org.id,
        threadId: thread.id,
        reason: 'Needs human review',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notified: 1 });
    expect(sendMessageSpy).toHaveBeenCalledTimes(2);
  });
});

describe('POST /internal/operator/turn', () => {
  function turnBody(instruction = "what's in my inbox?") {
    return {
      organizationId: org.id,
      clerkUserId: 'usr_desk',
      instruction,
    };
  }

  it('returns 401 when x-internal-secret is missing', async () => {
    const res = await request(app).post('/internal/operator/turn').send(turnBody());

    expect(res.status).toBe(401);
    expect(executeAgentTurnSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when a required field is missing', async () => {
    const res = await request(app)
      .post('/internal/operator/turn')
      .set('x-internal-secret', SECRET)
      .send({ organizationId: org.id, clerkUserId: 'usr_desk' });

    expect(res.status).toBe(400);
    expect(executeAgentTurnSpy).not.toHaveBeenCalled();
  });

  // The Concierge has no thread of its own: it resolves the merchant's durable
  // operator thread from their membership, which is the one their phone uses.
  it("runs the turn on the caller's operator thread with the operator module tools", async () => {
    const res = await request(app)
      .post('/internal/operator/turn')
      .set('x-internal-secret', SECRET)
      .send(turnBody());

    expect(res.status).toBe(200);

    const member = await db.orgMember.findUniqueOrThrow({
      where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: 'usr_desk' } },
    });
    const thread = await db.thread.findFirstOrThrow({
      where: { organizationId: org.id, operatorKey: `member:${member.id}` },
    });
    expect(thread.channelType).toBe('sms_agent');
    expect(res.body).toEqual({
      threadId: thread.id,
      summary: 'Nothing urgent.',
      actionsPerformed: [],
      awaitingApproval: false,
    });

    const params = executeAgentTurnSpy.mock.calls[0][0];
    expect(params).toMatchObject({
      orgId: org.id,
      threadId: thread.id,
      instruction: "what's in my inbox?",
      operatorLedger: "Nothing is awaiting the merchant's decision.",
    });
    expect(Object.keys(params.moduleTools).sort()).toEqual([
      'answer_operator_question',
      'approve_pending_plan',
      'get_ticket',
      'list_active_tickets',
      'mark_ticket_spam',
      'navigate_dashboard',
      'reject_pending_plan',
      'revise_pending_plan',
      'search_product_help',
      'send_ticket_reply',
    ]);
  });

  it('reports a still-parked plan so the panel can offer approval', async () => {
    const customer = await createTestCustomer(org.id, 'ticket@example.com');
    const ticket = await createTestThread(org.id, customer.id, ChannelType.email);
    const memberKey = await resolveOperatorMemberKey(org.id, 'usr_desk');
    await updateContext(org.id, memberKey, {
      pendingPlan: { threadId: ticket.id, instruction: 'refund #1002', rawToolCalls: [] },
    });

    const res = await request(app)
      .post('/internal/operator/turn')
      .set('x-internal-secret', SECRET)
      .send(turnBody('what is waiting on me?'));

    expect(res.status).toBe(200);
    expect(res.body.awaitingApproval).toBe(true);
  });

  it('maps a spend-cap failure to the 429 the dashboard passes through', async () => {
    executeAgentTurnSpy.mockRejectedValueOnce(
      new SpendCapError(usdToNanoDollars(25), usdToNanoDollars(25)),
    );

    const res = await request(app)
      .post('/internal/operator/turn')
      .set('x-internal-secret', SECRET)
      .send(turnBody());

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: 'spend_cap_reached', currentUsd: 25, capUsd: 25 });
  });
});

// A button press is a decision already made — it resolves the plan without a
// model call, the way the messaging channels' keyword fast path does.
describe('POST /internal/operator/plan-decision', () => {
  async function parkPlan(planId: string) {
    const customer = await createTestCustomer(org.id, `${planId}@example.com`);
    const ticket = await createTestThread(org.id, customer.id, ChannelType.email);
    const memberKey = await resolveOperatorMemberKey(org.id, 'usr_desk');
    await updateContext(org.id, memberKey, {
      pendingPlan: { threadId: ticket.id, instruction: 'refund #1002', rawToolCalls: [], planId },
    });
    return { memberKey, ticket };
  }

  it('returns 401 when x-internal-secret is missing', async () => {
    const res = await request(app)
      .post('/internal/operator/plan-decision')
      .send({ organizationId: org.id, clerkUserId: 'usr_desk', planId: 'p1', decision: 'dismiss' });

    expect(res.status).toBe(401);
  });

  it('returns 400 for a decision it does not recognize', async () => {
    const res = await request(app)
      .post('/internal/operator/plan-decision')
      .set('x-internal-secret', SECRET)
      .send({ organizationId: org.id, clerkUserId: 'usr_desk', planId: 'p1', decision: 'maybe' });

    expect(res.status).toBe(400);
  });

  it('dismisses the named plan and leaves the queue empty', async () => {
    const { memberKey } = await parkPlan('plan-dismiss-1');

    const res = await request(app)
      .post('/internal/operator/plan-decision')
      .set('x-internal-secret', SECRET)
      .send({
        organizationId: org.id,
        clerkUserId: 'usr_desk',
        planId: 'plan-dismiss-1',
        decision: 'dismiss',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ summary: 'Plan dismissed.' });
    expect((await getContext(org.id, memberKey)).pendingPlans).toEqual([]);
    expect(executeAgentTurnSpy).not.toHaveBeenCalled();
  });

  // Addressed by planId, not by position: a plan someone resolved on their phone
  // must not let a stale panel act on whatever is sitting in that slot now.
  it('returns 409 when the plan is no longer queued', async () => {
    const { memberKey } = await parkPlan('plan-live-1');

    const res = await request(app)
      .post('/internal/operator/plan-decision')
      .set('x-internal-secret', SECRET)
      .send({
        organizationId: org.id,
        clerkUserId: 'usr_desk',
        planId: 'plan-already-gone',
        decision: 'approve',
      });

    expect(res.status).toBe(409);
    expect((await getContext(org.id, memberKey)).pendingPlans).toHaveLength(1);
  });
});
