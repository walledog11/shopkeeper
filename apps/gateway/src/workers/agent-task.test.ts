import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import {
  acceptMemberAgentRequest,
  acceptTicketAgentRequest,
  attachMemberAgentTask,
  cancelMemberAgentTask,
} from '@shopkeeper/agent/task-ledger';

const { anthropicCreate, sendPhone } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(), sendPhone: vi.fn().mockResolvedValue(true),
}));
vi.mock('../clients/telegram-client.js', () => ({
  isTelegramConfigured: () => true,
  sendMessage: sendPhone,
  sendChatAction: vi.fn().mockResolvedValue(true),
  setMessageReaction: vi.fn().mockResolvedValue(true),
}));

// Only the model provider, the Redis lock and the network are stood in for. The
// task ledger, the operator turn, the agent loop, dispatch authorization and the
// shop tool are the real ones, reached through the worker's own entry point.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: anthropicCreate };
  },
}));

vi.mock('../clients/agent-runtime.js', () => ({
  getGatewayLockProvider: () => ({
    acquire: vi.fn(async () => ({ isLost: () => false, release: vi.fn(async () => {}) })),
  }),
}));

import { processAgentTaskJob } from './agent-task.js';
import { getContext, updateContext } from '../operator-context.js';
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import { readAgentPlanCacheRecordShape } from '@shopkeeper/agent/plan-cache-shape';

const fetchMock = vi.fn();
let orgId: string | undefined;

function discountMutations() {
  return fetchMock.mock.calls.filter(([, init]) => (
    typeof (init as RequestInit | undefined)?.body === 'string'
    && ((init as RequestInit).body as string).includes('discountAutomaticBasicCreate')
  ));
}

// A merchant's operator request, accepted and attached as a queued durable task
// exactly as the dashboard and the messaging channels create one.
async function seedQueuedTask() {
  const org = await createTestOrg();
  orgId = org.id;
  const member = await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: randomUUID() } });
  const customer = await createTestCustomer(org.id, `owner-${randomUUID()}@test.com`, { name: 'Owner' });
  const thread = await createTestThread(org.id, customer.id, ChannelType.operator);
  await db.thread.update({ where: { id: thread.id }, data: { operatorKey: `member:${member.id}` } });
  await createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    externalAccountId: 'task-stop-store.myshopify.com',
    accessToken: 'shpat_test',
    metadata: { oauthScopes: ['write_discounts', 'read_products'] },
  });
  const input = {
    organizationId: org.id,
    clerkUserId: member.clerkUserId,
    threadId: thread.id,
    dedupeKey: randomUUID(),
    instruction: 'Put the whole store on 20% off for the weekend',
  };
  const chatId = `task-stop-${randomUUID()}`;
  await db.orgMemberTelegramChat.create({ data: { orgMemberId: member.id, chatId } });
  const event = await db.operatorEvent.create({ data: {
    organizationId: org.id, clerkUserId: member.clerkUserId, channel: 'telegram', chatId,
    providerMessageId: randomUUID(), operatorKey: `member:${member.id}`, body: input.instruction,
    status: 'claimed', claimToken: randomUUID(), claimedAt: new Date(),
  } });
  const { request } = await acceptMemberAgentRequest({ ...input, sourceOperatorEventId: event.id });
  const task = await attachMemberAgentTask({
    ...input,
    requestId: request.id,
    budget: { runtimeVersion: 1, modelCallLimit: 10, activeTimeMsLimit: 120_000, spendNanoUsdLimit: 1_000_000_000n },
  });
  return { input, task, event };
}

const storewideSale = {
  stop_reason: 'tool_use',
  content: [{
    type: 'tool_use',
    id: 'tu_sale',
    name: 'create_flash_sale',
    input: { applies_to: 'entire_catalog', discount_percentage: 20, duration_hours: 48 },
  }],
  usage: { input_tokens: 900, output_tokens: 60 },
};

const finished = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: 'Done.' }],
  usage: { input_tokens: 950, output_tokens: 10 },
};

beforeEach(() => {
  anthropicCreate.mockReset();
  sendPhone.mockClear().mockResolvedValue(true);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    data: {
      discountAutomaticBasicCreate: {
        automaticDiscountNode: null,
        userErrors: [{ field: ['title'], message: 'Title has already been taken' }],
      },
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupTestData(orgId);
  orgId = undefined;
});

describe('processAgentTaskJob', () => {
  it('publishes the committed composer proposal to the phone queue without executing it', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const member = await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: randomUUID() } });
    await db.orgMemberTelegramChat.create({ data: { orgMemberId: member.id, chatId: `composer-${randomUUID()}` } });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`, { name: 'Chain Market' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const source = await createTestMessage(thread.id, 'Can you help with my order?');
    const input = {
      organizationId: org.id, clerkUserId: member.clerkUserId, threadId: thread.id,
      dedupeKey: randomUUID(), instruction: 'Draft a brief acknowledgement for the customer', force: true,
      budget: { runtimeVersion: 2, modelCallLimit: 10, activeTimeMsLimit: 120_000, spendNanoUsdLimit: 1_000_000_000n },
    };
    const { task } = await acceptTicketAgentRequest(input);
    anthropicCreate.mockResolvedValueOnce({
      ...storewideSale,
      content: [{ type: 'tool_use', id: 'tu_reply', name: 'send_reply', input: { text: 'Thanks for contacting us. We are reviewing your request.' } }],
    }).mockResolvedValue(finished);

    const job = { organizationId: org.id, taskId: task.id, revision: task.revision };
    sendPhone.mockResolvedValueOnce(false);
    await expect(processAgentTaskJob(job)).rejects.toThrow('Telegram send failed');

    const stored = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.status).toBe('waiting_approval');
    const cached = readAgentPlanCacheRecordShape((await db.thread.findUniqueOrThrow({ where: { id: thread.id } })).cachedPlan)!;
    expect(cached.planId).toBe(stored.activeProposalId);
    const modelCalls = anthropicCreate.mock.calls.length;
    await processAgentTaskJob(job);
    await processAgentTaskJob(job);
    expect(anthropicCreate).toHaveBeenCalledTimes(modelCalls);
    expect(sendPhone).toHaveBeenCalledTimes(2);
    expect((await getContext(org.id, `member:${member.id}`)).pendingPlan).toMatchObject({
      planId: cached.planId, sourceMessageId: source.id,
      planHash: hashPlan(cached.plan), instructionHash: hashInstruction(input.instruction),
    });
    expect(await db.agentAction.count({ where: { organizationId: org.id, threadId: thread.id } })).toBe(0);
    expect(await db.message.count({ where: { threadId: thread.id, senderType: 'agent' } })).toBe(0);
    await acceptTicketAgentRequest({ ...input, dedupeKey: randomUUID(), instruction: 'Use different wording' });
    await processAgentTaskJob(job);
    expect(sendPhone).toHaveBeenCalledTimes(2);
    expect(anthropicCreate).toHaveBeenCalledTimes(modelCalls);
  });

  // The merchant presses stop while the model is still thinking. Whatever the model
  // asks for next, the stop owns the task: its write must not reach Shopify and no
  // further model call is bought on the task's budget.
  it('keeps a write the model asks for after the merchant stops the task from reaching Shopify', async () => {
    const { input, task, event } = await seedQueuedTask();
    anthropicCreate.mockImplementationOnce(async () => {
      await cancelMemberAgentTask({
        organizationId: input.organizationId,
        clerkUserId: input.clerkUserId,
        taskId: task.id,
        expectedRevision: task.revision,
      });
      return storewideSale;
    });
    anthropicCreate.mockResolvedValue(finished);

    await processAgentTaskJob({ organizationId: input.organizationId, taskId: task.id, revision: task.revision });

    expect(discountMutations()).toHaveLength(0);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    const action = await db.agentAction.findFirstOrThrow({
      where: { organizationId: input.organizationId, tool: 'create_flash_sale' },
    });
    expect(action.taskId).toBe(task.id);
    expect(action.dispatchState).toBe('prepared');
    const stored = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.status).toBe('cancelled');
    expect(stored.modelCallsUsed).toBe(1);
    const phoneEvent = await db.operatorEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(phoneEvent.status).toBe('committed');
    expect(phoneEvent.replyText).toContain('Stopped');
    expect(phoneEvent.replyDeliveredAt).toBeTruthy();
    expect(sendPhone).toHaveBeenCalledOnce();
  });

  // Same task, same model output, no stop: the write does reach Shopify, so the
  // case above is held back by the stop and not by anything in the setup.
  it('sends the same write to Shopify when the task was not stopped', async () => {
    const { input, task } = await seedQueuedTask();
    const ticketCustomer = await createTestCustomer(input.organizationId, randomUUID());
    const ticket = await createTestThread(input.organizationId, ticketCustomer.id, ChannelType.email);
    await updateContext(input.organizationId, task.initiatingActorKey, {
      pendingQuestion: { threadId: ticket.id, question: 'Does the customer want a replacement?' },
    });
    anthropicCreate.mockResolvedValueOnce(storewideSale).mockResolvedValue(finished);

    await processAgentTaskJob({ organizationId: input.organizationId, taskId: task.id, revision: task.revision });

    expect(discountMutations()).toHaveLength(1);
    const stored = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.modelCallsUsed).toBe(2);
    expect(stored.spentNanoUsd).toBeGreaterThan(0n);
    expect(stored.status).toBe('completed');
    expect((await getContext(input.organizationId, task.initiatingActorKey)).pendingQuestion?.threadId).toBe(ticket.id);
  });
});
