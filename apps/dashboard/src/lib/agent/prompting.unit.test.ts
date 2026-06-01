import { describe, expect, it } from 'vitest';
import type { CustomerMemory } from '@clerk/db';
import type { AgentContext } from './runner';
import { selectToolNamesForInstruction } from './runner';
import { buildComposerAskPrompt, buildSystemPrompt } from './prompt';
import { AGENT_TOOLS, TOOL_GROUPS, toolNamesForGroups } from './tools';

function makeMemory(overrides: Partial<CustomerMemory> = {}): CustomerMemory {
  return {
    summary: 'Customer prefers proactive shipping updates.',
    keyFacts: [
      'VIP since 2024',
      'Prefers email updates',
      'Usually asks about shipping timelines',
      'This fourth fact should stay out of the prompt',
    ],
    policyFlags: { vip: true, complaintPattern: true },
    recentInteractions: [
      {
        threadId: 'thread_recent_1',
        channel: 'email',
        tag: 'Shipping',
        closedAt: '2026-05-26T12:00:00.000Z',
        outcome: 'Resolved a delayed shipment question.',
      },
      {
        threadId: 'thread_recent_2',
        channel: 'email',
        tag: 'Returns',
        closedAt: '2026-05-25T12:00:00.000Z',
        outcome: 'Explained the return window.',
      },
      {
        threadId: 'thread_recent_3',
        channel: 'email',
        tag: null,
        closedAt: '2026-05-24T12:00:00.000Z',
        outcome: 'Updated the customer profile.',
      },
      {
        threadId: 'thread_old',
        channel: 'email',
        tag: 'Old',
        closedAt: '2026-05-23T12:00:00.000Z',
        outcome: 'This older interaction should stay out of the prompt.',
      },
    ],
    version: 1,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: 'org_test',
    orgName: 'Test Store',
    customer: { id: 'customer_test', name: 'Jane Test', platformId: 'jane@test.com' },
    customerMemory: null,
    recentMessages: [{ senderType: 'customer', contentText: 'What is the status of my order?' }],
    openThreadCount: 1,
    shopify: { shop: 'test-store.myshopify.com', accessToken: 'shpat_test' },
    recentOrders: [],
    linkedShopifyCustomerName: null,
    kbArticles: [],
    thread: {
      id: 'thread_test',
      status: 'open',
      channelType: 'email',
      tag: 'Support',
      aiSummary: null,
      shopifyCustomerId: null,
    },
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('renders customer memory after brand context and before the knowledge base', () => {
    const prompt = buildSystemPrompt(
      makeCtx({
        customerMemory: makeMemory(),
        kbArticles: [{ title: 'Shipping policy', body: 'Shipping takes 3-5 days.' }],
      }),
      { aiContext: 'A premium travel goods store.', brandVoice: 'direct and warm' },
    );

    expect(prompt).toContain('## What you know about this customer');
    expect(prompt).toContain('Customer prefers proactive shipping updates.');
    expect(prompt).toContain('- VIP since 2024');
    expect(prompt).toContain('- Prefers email updates');
    expect(prompt).toContain('- Usually asks about shipping timelines');
    expect(prompt).not.toContain('This fourth fact should stay out of the prompt');
    expect(prompt).toContain('- Shipping , Resolved a delayed shipment question. (2026-05-26T12:00:00.000Z)');
    expect(prompt).toContain('- Returns , Explained the return window. (2026-05-25T12:00:00.000Z)');
    expect(prompt).toContain('- untagged , Updated the customer profile. (2026-05-24T12:00:00.000Z)');
    expect(prompt).not.toContain('This older interaction should stay out of the prompt');
    expect(prompt).toContain('This customer has filed multiple complaints recently , bias toward escalation.');
    expect(prompt).toContain('This is a high-value customer , extra care on tone.');

    expect(prompt.indexOf('## About this store')).toBeLessThan(prompt.indexOf('## What you know about this customer'));
    expect(prompt.indexOf('## What you know about this customer')).toBeLessThan(prompt.indexOf('## Knowledge base'));
  });

  it('omits customer memory when none is loaded', () => {
    const prompt = buildSystemPrompt(makeCtx({ customerMemory: null }));

    expect(prompt).not.toContain('## What you know about this customer');
  });

  it('renders customer memory in operator mode before instructions', () => {
    const prompt = buildSystemPrompt(makeCtx({
      customerMemory: makeMemory(),
      thread: {
        id: 'thread_test',
        status: 'open',
        channelType: 'dashboard_agent',
        tag: 'Support',
        aiSummary: null,
        shopifyCustomerId: null,
      },
    }));

    expect(prompt).toContain('## What you know about this customer');
    expect(prompt.indexOf('## What you know about this customer')).toBeLessThan(prompt.indexOf('## Instructions'));
  });

  it('tells operator mode to answer unfulfilled order status questions without tracking lookups', () => {
    const prompt = buildSystemPrompt(makeCtx({
      thread: {
        id: 'thread_test',
        status: 'open',
        channelType: 'dashboard_agent',
        tag: 'Support',
        aiSummary: null,
        shopifyCustomerId: null,
      },
    }));

    expect(prompt).toMatch(/fulfillment_status:\s*null/);
    expect(prompt).toMatch(/not fulfilled/i);
    expect(prompt).toContain('get_order_tracking');
    expect(prompt).toMatch(/fulfilled or partially fulfilled/i);
  });

  it('tells support mode to answer unfulfilled order status questions without tracking lookups', () => {
    const prompt = buildSystemPrompt(makeCtx({
      recentOrders: [{
        id: '7130623770944',
        name: '#PG1006',
        created_at: '2026-04-11T16:41:39-07:00',
        financial_status: 'pending',
        fulfillment_status: null,
        total_price: '74.95',
        items: [],
        shipping_address: null,
      }],
    }));

    expect(prompt).toMatch(/fulfillment_status is null/i);
    expect(prompt).toMatch(/not shipped/i);
    expect(prompt).toContain('get_order_tracking');
    expect(prompt).toMatch(/fulfilled or partially fulfilled/i);
  });
});

describe('buildComposerAskPrompt', () => {
  it('renders customer memory for private composer asks', () => {
    const prompt = buildComposerAskPrompt(makeCtx({ customerMemory: makeMemory() }));

    expect(prompt).toContain('## What you know about this customer');
    expect(prompt).toContain('Customer prefers proactive shipping updates.');
    expect(prompt.indexOf('## What you know about this customer')).toBeLessThan(prompt.indexOf('## Knowledge base'));
    expect(prompt.indexOf('## What you know about this customer')).toBeLessThan(prompt.indexOf('## Rules'));
  });
});

describe('selectToolNamesForInstruction', () => {
  it('prunes operator order-status lookups to the minimal Shopify read tools', () => {
    const tools = selectToolNamesForInstruction(
      makeCtx({
        thread: {
          id: 'thread_test',
          status: 'open',
          channelType: 'dashboard_agent',
          tag: 'Support',
          aiSummary: null,
          shopifyCustomerId: null,
        },
      }),
      "What's the status of Scooby's order?"
    );

    expect(tools).toEqual([
      'search_shopify_customers',
      'get_shopify_orders',
      'get_order_tracking',
    ]);
  });

  it('uses order lookup tools when an operator gives an explicit order number', () => {
    const tools = selectToolNamesForInstruction(
      makeCtx({
        thread: {
          id: 'thread_test',
          status: 'open',
          channelType: 'dashboard_agent',
          tag: 'Support',
          aiSummary: null,
          shopifyCustomerId: null,
        },
      }),
      'Track order #PG1006'
    );

    expect(tools).toEqual([
      'get_order_by_name',
      'get_order_tracking',
    ]);
  });

  it('prunes operator create-order requests with explicit customer info to product lookup and order creation', () => {
    const tools = selectToolNamesForInstruction(
      makeCtx({
        thread: {
          id: 'thread_test',
          status: 'open',
          channelType: 'dashboard_agent',
          tag: 'Support',
          aiSummary: null,
          shopifyCustomerId: null,
        },
      }),
      'Create an order for 1 Pencil Half Zip XL for scooby@example.com'
    );

    expect(tools).toEqual([
      'search_shopify_products',
      'create_shopify_order',
    ]);
  });

  it('allows customer lookup for create-order requests without explicit customer info', () => {
    const tools = selectToolNamesForInstruction(
      makeCtx({
        thread: {
          id: 'thread_test',
          status: 'open',
          channelType: 'dashboard_agent',
          tag: 'Support',
          aiSummary: null,
          shopifyCustomerId: null,
        },
      }),
      'Create an order for 1 Pencil Half Zip XL for Scooby'
    );

    expect(tools).toEqual([
      'search_shopify_products',
      'search_shopify_customers',
      'get_shopify_customer',
      'create_shopify_order',
    ]);
  });

  it('does not prune action-oriented operator requests', () => {
    const tools = selectToolNamesForInstruction(
      makeCtx({
        thread: {
          id: 'thread_test',
          status: 'open',
          channelType: 'dashboard_agent',
          tag: 'Support',
          aiSummary: null,
          shopifyCustomerId: null,
        },
      }),
      "Cancel Scooby's order"
    );

    expect(tools).toBeNull();
  });
});

describe('AGENT_TOOLS', () => {
  it('guides status checks toward order data before tracking', () => {
    const getOrders = AGENT_TOOLS.find((tool) => tool.name === 'get_shopify_orders');
    const getTracking = AGENT_TOOLS.find((tool) => tool.name === 'get_order_tracking');

    expect(getOrders?.description).toMatch(/order-status/i);
    expect(getOrders?.description).toContain('fulfillment_status');
    expect(getOrders?.description).toContain('get_order_tracking');

    expect(getTracking?.description).toMatch(/fulfilled or partially fulfilled/i);
    expect(getTracking?.description).toMatch(/unfulfilled orders/i);
  });
});

describe('TOOL_GROUPS', () => {
  it('partitions every agent tool into exactly one module group', () => {
    const grouped = Object.values(TOOL_GROUPS).flat();
    const toolNames = AGENT_TOOLS.map((t) => t.name);

    expect([...grouped].sort()).toEqual([...toolNames].sort());
    expect(grouped.length).toBe(new Set(grouped).size);
  });

  it('flattens groups into an allow-list for selectAgentTools', () => {
    expect(toolNamesForGroups('product', 'messaging')).toEqual([
      'search_shopify_products',
      'send_reply',
      'send_email',
    ]);
  });
});
