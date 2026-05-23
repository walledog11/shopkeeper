import { describe, expect, it } from 'vitest';
import type { AgentContext } from './runner';
import { buildSystemPrompt, selectToolNamesForInstruction } from './runner';
import { AGENT_TOOLS } from './tools';

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: 'org_test',
    orgName: 'Test Store',
    customer: { name: 'Jane Test', platformId: 'jane@test.com' },
    recentMessages: [{ senderType: 'customer', contentText: 'What is the status of my order?' }],
    openThreadCount: 1,
    shopify: { shop: 'test-store.myshopify.com', accessToken: 'shpat_test' },
    recentOrders: [],
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
      }],
    }));

    expect(prompt).toMatch(/fulfillment_status is null/i);
    expect(prompt).toMatch(/not shipped/i);
    expect(prompt).toContain('get_order_tracking');
    expect(prompt).toMatch(/fulfilled or partially fulfilled/i);
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
