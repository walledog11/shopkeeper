import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, SenderType, db } from '@clerk/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@clerk/db/test-helpers';
import { AGENT_NOTE_PREFIX } from '@/lib/messaging/thread-constants';
import { AGENT_SETTINGS_DEFAULTS } from './settings';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockCreate, mockSendReply } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockSendReply: vi.fn(),
}));

vi.mock('@/lib/ai/anthropic', () => ({
  anthropic: { messages: { create: mockCreate } },
}));

vi.mock('@/lib/agent/tools/thread', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/tools/thread')>();
  return { ...actual, sendReply: mockSendReply };
});

vi.mock('@/lib/agent/spend', () => ({
  enforceSpendCap: vi.fn().mockResolvedValue(undefined),
  recordSpend: vi.fn().mockResolvedValue(undefined),
  getDailySpendNano: vi.fn().mockResolvedValue(0),
}));

import { runAgent } from './runner';
import type { AgentContext } from './runner';

// ── Response factories ────────────────────────────────────────────────────────

function toolUse(name: string, input: Record<string, unknown>, id = 'tu_1') {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id, name, input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function endTurn(text = 'Done.') {
  return { stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

// ── Shared state ──────────────────────────────────────────────────────────────

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let thread: Awaited<ReturnType<typeof createTestThread>>;

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: org.id,
    orgName: 'Test Store',
    customer: { name: 'Jane', platformId: 'jane@test.com' },
    recentMessages: [{ senderType: 'customer', contentText: 'Help me' }],
    openThreadCount: 1,
    shopify: null,
    recentOrders: [],
    kbArticles: [],
    thread: {
      id: thread.id,
      status: 'open',
      channelType: 'email',
      tag: 'Support',
      aiSummary: null,
      shopifyCustomerId: null,
    },
    ...overrides,
  };
}

beforeEach(async () => {
  mockSendReply.mockResolvedValue('Reply sent to customer via email.');
  org = await createTestOrg();
  const customer = await createTestCustomer(org.id, 'jane@test.com', { name: 'Jane Test' });
  thread = await createTestThread(org.id, customer.id, ChannelType.email);
  await createTestMessage(thread.id, 'I need help with my order');
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

// ── Tool: add_internal_note ───────────────────────────────────────────────────

describe('executeTool — add_internal_note', () => {
  it('writes a note message to the DB with the agent note prefix', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUse('add_internal_note', { text: 'Customer is VIP' }))
      .mockResolvedValueOnce(endTurn());

    await runAgent(makeCtx(), 'Note that the customer is VIP');

    const notes = await db.message.findMany({
      where: { threadId: thread.id, senderType: SenderType.note },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].contentText).toBe(`${AGENT_NOTE_PREFIX}Customer is VIP`);
  });
});

// ── Tool: update_thread_status ────────────────────────────────────────────────

describe('executeTool — update_thread_status', () => {
  it('updates the thread status in the DB', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUse('update_thread_status', { status: 'closed' }))
      .mockResolvedValueOnce(endTurn('Thread closed.'));

    await runAgent(makeCtx(), 'Close this thread');

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.status).toBe('closed');
  });
});

// ── Tool: update_thread_tag ───────────────────────────────────────────────────

describe('executeTool — update_thread_tag', () => {
  it('updates the thread tag in the DB', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUse('update_thread_tag', { tag: 'Refund' }))
      .mockResolvedValueOnce(endTurn('Tagged.'));

    await runAgent(makeCtx(), 'Tag this thread as Refund');

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.tag).toBe('Refund');
  });
});

// ── Tool: send_reply ─────────────────────────────────────────────────────────

describe('executeTool — send_reply', () => {
  it('dispatches to sendReply and records the result in actionsPerformed', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUse('send_reply', { text: 'Your order shipped!' }))
      .mockResolvedValueOnce(endTurn('Reply sent.'));

    const result = await runAgent(makeCtx(), 'Tell the customer their order shipped');

    expect(mockSendReply).toHaveBeenCalledWith(
      { text: 'Your order shipped!' },
      expect.objectContaining({ threadId: thread.id, orgId: org.id })
    );
    expect(result.actionsPerformed[0].result).toBe('Reply sent to customer via email.');
  });
});

// ── Tool: search_kb ───────────────────────────────────────────────────────────

describe('executeTool — search_kb', () => {
  it('returns matching KB articles from the DB', async () => {
    const kb = await db.knowledgeBase.create({
      data: { organizationId: org.id, name: 'Test KB', source: 'user' },
    });
    try {
      await db.kbArticle.create({
        data: {
          organizationId: org.id,
          knowledgeBaseId: kb.id,
          title: 'Return Policy',
          body: 'Items can be returned within 30 days.',
          tags: ['returns'],
        },
      });

      mockCreate
        .mockResolvedValueOnce(toolUse('search_kb', { query: 'return policy' }))
        .mockResolvedValueOnce(endTurn('Found the return policy.'));

      const result = await runAgent(makeCtx(), 'Find the return policy');

      const kbResult = result.actionsPerformed.find(a => a.tool === 'search_kb');
      expect(kbResult).toBeDefined();
      expect(kbResult!.result).toContain('Return Policy');
      expect(kbResult!.result).toContain('30 days');
    } finally {
      await db.knowledgeBase.delete({ where: { id: kb.id } });
    }
  });
});

// ── Tool: shopify guard ───────────────────────────────────────────────────────

describe('executeTool — shopify guard', () => {
  it('returns an error string when no Shopify integration is connected', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUse('get_shopify_orders', { customer_id: '999' }))
      .mockResolvedValueOnce(endTurn());

    const result = await runAgent(makeCtx(), 'Get customer orders');

    expect(result.actionsPerformed[0].result).toBe('Error: no Shopify integration connected.');
  });
});

// ── runAgent: loop behaviour ──────────────────────────────────────────────────

describe('runAgent', () => {
  it('returns the summary text on immediate end_turn', async () => {
    mockCreate.mockResolvedValueOnce(endTurn('Nothing to do.'));

    const result = await runAgent(makeCtx(), 'Do nothing');

    expect(result.summary).toBe('Nothing to do.');
    expect(result.actionsPerformed).toHaveLength(0);
  });

  it('tracks all parallel tool calls from a single response in actionsPerformed', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'update_thread_tag', input: { tag: 'Billing' } },
          { type: 'tool_use', id: 'tu_2', name: 'add_internal_note', input: { text: 'Billing issue' } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce(endTurn('All done.'));

    const result = await runAgent(makeCtx(), 'Tag and note this billing thread');

    expect(result.actionsPerformed).toHaveLength(2);
    expect(result.actionsPerformed.map(a => a.tool)).toEqual(
      expect.arrayContaining(['update_thread_tag', 'add_internal_note'])
    );
  });

  it('answers simple operator order-status requests without an LLM loop', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        customers: [
          { id: 10368767590720, first_name: 'Tiffany', last_name: 'Johnson', email: 'tfhut23993@yahoo.com', phone: null },
          { id: 10368746160448, first_name: 'John', last_name: 'Smith', email: 'jrsmith2822@yahoo.com', phone: null },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        orders: [{
          id: 7108594991424,
          name: '#PG1003',
          created_at: '2026-04-03T16:14:11-07:00',
          financial_status: 'pending',
          fulfillment_status: null,
          current_total_price: '149.90',
          currency: 'USD',
          line_items: [
            { id: 17213578772800, variant_id: 51536929915200, title: 'Pencil Half Zip', quantity: 1, fulfillable_quantity: 1, current_quantity: 1, fulfillment_status: null },
            { id: 17238938583360, variant_id: 51536929947968, title: 'Pencil Half Zip', quantity: 1, fulfillable_quantity: 1, current_quantity: 1, fulfillment_status: null },
          ],
        }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runAgent(
      makeCtx({
        shopify: { shop: 'test-store.myshopify.com', accessToken: 'shpat_test' },
        thread: {
          id: thread.id,
          status: 'open',
          channelType: 'dashboard_agent',
          tag: 'Support',
          aiSummary: null,
          shopifyCustomerId: null,
        },
      }),
      "What is the status on John's order?"
    );

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.actionsPerformed.map((action) => action.tool)).toEqual([
      'search_shopify_customers',
      'get_shopify_orders',
    ]);
    expect(result.summary).toContain("John Smith's latest order #PG1003");
    expect(result.summary).toContain('pending payment');
    expect(result.summary).toContain('has not shipped yet');
    expect(result.summary).toContain('2x Pencil Half Zip');
  });

  it('executes pre-approved tool calls without starting another model loop', async () => {
    const result = await runAgent(
      makeCtx(),
      'Execute plan',
      [{ id: 'pre_1', name: 'add_internal_note', input: { text: 'Pre-approved note' } }]
    );

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0].tool).toBe('add_internal_note');

    const notes = await db.message.findMany({
      where: { threadId: thread.id, senderType: SenderType.note },
    });
    expect(notes.some(n => n.contentText === `${AGENT_NOTE_PREFIX}Pre-approved note`)).toBe(true);
  });

  it('returns the exhaustion message when max iterations is reached', async () => {
    mockCreate.mockResolvedValue(toolUse('update_thread_tag', { tag: 'loop' }));

    const result = await runAgent(
      makeCtx(),
      'Loop forever',
      undefined,
      { ...AGENT_SETTINGS_DEFAULTS, maxIterations: 2 }
    );

    expect(result.summary).toBe('Reached maximum steps without completing the task.');
    expect(result.actionsPerformed).toHaveLength(2);
  });
});
