import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import { runOrderOps } from '@shopkeeper/agent/order-ops';
import { allowTestNetworkHosts } from '../../../scripts/test-network-guard.mjs';
import type { OrderForReview, OrderOpsContext, OrderOpsResult } from '@shopkeeper/agent/order-ops';

// Order-ops (module #2) fraud-review evals. Unlike the support planner evals in
// the dashboard, order-ops runs a thread-less `runOrderOps` loop: given one order
// plus deterministic pre-scan signals, the model decides whether to flag_order.
// These fixtures gate that *judgment*. They deliberately hand-set `riskSignals`
// (bypassing computeRiskSignals) so the eval isolates the model's flag/no-flag
// decision from the pre-scan heuristic — each hand-set signal is kept internally
// consistent with the order payload the prompt also serializes.
//
// Lives in the gateway (not @shopkeeper/agent) for the same reason as
// order-ops-audit.test.ts: runOrderOps' spend cap and audit batch need the real
// DB, which only the gateway's DB-backed integration job provides. Real-model
// fixtures are gated on a real ANTHROPIC_API_KEY and skip otherwise (same
// opt-in contract as the dashboard evals), so keyless CI never spends or 401s.

const hasRealKey =
  typeof process.env.ANTHROPIC_API_KEY === 'string'
  && process.env.ANTHROPIC_API_KEY.length > 0
  && process.env.ANTHROPIC_API_KEY !== 'test-anthropic-key';

// Per-fixture simulated read-tool results. The order-ops loop dispatches read
// tools (get_shopify_customer, get_order_tracking) through the shared executor.
// The mock intercepts *every* read tool so it never reaches the live Shopify API:
// a fixture's scenario lookup when provided, else a neutral "no additional data".
// This keeps the eval hermetic and, crucially, keeps a fixture's flag/no-flag
// verdict a measure of judgment rather than of how the model reacts to a
// network-blocked lookup. flag_order is a module tool and is left to run for real
// so it exercises ctx.escalate.
const simulatedReadResults = vi.hoisted(() => ({ current: null as Map<string, string> | null }));

vi.mock('@shopkeeper/agent/executor', async importOriginal => {
  const actual = await importOriginal<typeof import('@shopkeeper/agent/executor')>();
  const readTools = new Set(['get_shopify_customer', 'get_order_tracking']);
  const neutral = 'No additional data available for this lookup.';
  return {
    ...actual,
    executeToolWithStatus: (async (...args: Parameters<typeof actual.executeToolWithStatus>) => {
      const toolName = args[0];
      if (readTools.has(toolName)) {
        const result = simulatedReadResults.current?.get(toolName) ?? neutral;
        return { result, status: result.toLowerCase().startsWith('error:') ? 'error' : 'success' };
      }
      return actual.executeToolWithStatus(...args);
    }) as typeof actual.executeToolWithStatus,
  };
});

interface OrderOpsEvalFixture {
  id: string;
  description: string;
  order: OrderForReview;
  simulateReadResults?: { tool: string; result: string }[];
  // Whether a well-calibrated reviewer should flag this order.
  expectFlag: boolean;
  // Advisory fixtures record the outcome but never hard-fail: single stochastic
  // model calls on borderline fraud judgment are not gate material.
  advisory?: boolean;
}

const createdOrgIds: string[] = [];

async function buildEvalContext(
  orgId: string,
  order: OrderForReview,
  escalations: string[],
): Promise<OrderOpsContext> {
  return {
    orgId,
    orgName: 'Eval Store',
    recentMessages: [],
    shopify: { shop: 'order-ops-eval.myshopify.com', accessToken: 'eval-token' },
    escalate: async (reason: string) => {
      escalations.push(reason);
    },
    order,
  };
}

async function runOrderOpsFixture(
  fixture: OrderOpsEvalFixture,
): Promise<{ result: OrderOpsResult; escalations: string[] }> {
  const org = await createTestOrg();
  createdOrgIds.push(org.id);
  const escalations: string[] = [];
  const ctx = await buildEvalContext(org.id, fixture.order, escalations);
  simulatedReadResults.current = new Map(
    (fixture.simulateReadResults ?? []).map(entry => [entry.tool, entry.result]),
  );
  try {
    const result = await runOrderOps(ctx);
    return { result, escalations };
  } finally {
    simulatedReadResults.current = null;
  }
}

// --- Model-judgment fixtures ---------------------------------------------------

// HARD GATE: three corroborating high-risk signals with no mitigating history.
// A reviewer flags this. Run repeatedly and require a flag on the majority so one
// stochastic miss can't turn the gate red.
const CLEAR_FRAUD: OrderOpsEvalFixture = {
  id: 'clear-fraud-multi-signal',
  description: 'High-value first order, billing/shipping country mismatch, payment uncaptured — flag.',
  expectFlag: true,
  order: {
    id: '5001',
    name: '#5001',
    createdAt: '2026-07-21T09:12:00Z',
    financialStatus: 'authorized',
    fulfillmentStatus: null,
    totalPrice: '862.00',
    currency: 'USD',
    customer: {
      id: '9001',
      email: 'buyer_x91@mail.example',
      ordersCount: 0,
      createdAt: '2026-07-21T09:05:00Z',
    },
    billing: { city: 'Miami', province: 'FL', country: 'United States' },
    shipping: { city: 'Lagos', province: null, country: 'Nigeria' },
    riskSignals: [
      {
        code: 'billing_shipping_country_mismatch',
        detail: 'Billing country United States differs from shipping country Nigeria.',
      },
      { code: 'high_value_new_customer', detail: 'First-time customer placed a USD 862.00 order.' },
      {
        code: 'payment_not_captured',
        detail: 'Order financial_status is "authorized" - payment has not been captured.',
      },
    ],
  },
};

// ADVISORY: a single weak signal (uncaptured payment) on an established, domestic,
// low-value order. Fraud-tuned models get jumpy here, so it is advisory-only.
const ESTABLISHED_AUTHORIZED: OrderOpsEvalFixture = {
  id: 'established-authorized-benign',
  description: 'Loyal customer, small domestic order, payment merely authorized — should not flag.',
  expectFlag: false,
  advisory: true,
  simulateReadResults: [
    {
      tool: 'get_shopify_customer',
      result:
        'Customer since 2023-02. 63 prior orders, no chargebacks or disputes. Billing and shipping have matched on every prior order.',
    },
  ],
  order: {
    id: '5002',
    name: '#5002',
    createdAt: '2026-07-21T14:03:00Z',
    financialStatus: 'authorized',
    fulfillmentStatus: null,
    totalPrice: '58.00',
    currency: 'USD',
    customer: {
      id: '9002',
      email: 'longtime@mail.example',
      ordersCount: 63,
      createdAt: '2023-02-11T00:00:00Z',
    },
    billing: { city: 'Austin', province: 'TX', country: 'United States' },
    shipping: { city: 'Austin', province: 'TX', country: 'United States' },
    riskSignals: [
      {
        code: 'payment_not_captured',
        detail: 'Order financial_status is "authorized" - payment has not been captured.',
      },
    ],
  },
};

// ADVISORY: lone country mismatch on a modest repeat order — plausibly a gift.
const COUNTRY_MISMATCH_ONLY: OrderOpsEvalFixture = {
  id: 'country-mismatch-only',
  description: 'Modest repeat order shipping to a different country — borderline gift pattern.',
  expectFlag: false,
  advisory: true,
  simulateReadResults: [
    {
      tool: 'get_shopify_customer',
      result:
        'Customer since 2024-09. 4 prior orders, no disputes or chargebacks. Two prior orders also shipped to a Canadian address.',
    },
  ],
  order: {
    id: '5003',
    name: '#5003',
    createdAt: '2026-07-20T18:40:00Z',
    financialStatus: 'paid',
    fulfillmentStatus: null,
    totalPrice: '142.00',
    currency: 'USD',
    customer: {
      id: '9003',
      email: 'repeat@mail.example',
      ordersCount: 4,
      createdAt: '2024-09-01T00:00:00Z',
    },
    billing: { city: 'Seattle', province: 'WA', country: 'United States' },
    shipping: { city: 'Vancouver', province: 'BC', country: 'Canada' },
    riskSignals: [
      {
        code: 'billing_shipping_country_mismatch',
        detail: 'Billing country United States differs from shipping country Canada.',
      },
    ],
  },
};

// ADVISORY: lone high-value-new-customer signal, domestic and captured.
const HIGH_VALUE_NEW_ONLY: OrderOpsEvalFixture = {
  id: 'high-value-new-only',
  description: 'First-time customer, high-value but domestic and captured — genuine judgment call.',
  expectFlag: false,
  advisory: true,
  simulateReadResults: [
    {
      tool: 'get_shopify_customer',
      result:
        'New customer — this is their first order; account created today. No prior order history and no disputes on file.',
    },
  ],
  order: {
    id: '5004',
    name: '#5004',
    createdAt: '2026-07-21T11:26:00Z',
    financialStatus: 'paid',
    fulfillmentStatus: null,
    totalPrice: '420.00',
    currency: 'USD',
    customer: {
      id: '9004',
      email: 'firsttime@mail.example',
      ordersCount: 1,
      createdAt: '2026-07-21T11:20:00Z',
    },
    billing: { city: 'Denver', province: 'CO', country: 'United States' },
    shipping: { city: 'Denver', province: 'CO', country: 'United States' },
    riskSignals: [
      { code: 'high_value_new_customer', detail: 'First-time customer placed a USD 420.00 order.' },
    ],
  },
};

// ADVISORY: the pre-scan flagged high_value_new_customer because the embedded
// customer record was sparse (ordersCount null). Consulting get_shopify_customer
// is the natural way to resolve it — the lookup reveals a long, clean history, so
// a good reviewer stands down. Exercises the read-tool path end to end.
const LOOKUP_REVEALS_HISTORY: OrderOpsEvalFixture = {
  id: 'lookup-reveals-history',
  description: 'Sparse embedded customer; a history lookup reveals an established buyer — should not flag.',
  expectFlag: false,
  advisory: true,
  simulateReadResults: [
    {
      tool: 'get_shopify_customer',
      result:
        'Customer since 2021-03. 47 prior orders totaling $6,240 across 3 years. No chargebacks or disputes. Email verified. Billing and shipping have matched on every prior order.',
    },
  ],
  order: {
    id: '5005',
    name: '#5005',
    createdAt: '2026-07-21T16:02:00Z',
    financialStatus: 'authorized',
    fulfillmentStatus: null,
    totalPrice: '510.00',
    currency: 'USD',
    customer: {
      id: '9005',
      email: 'known@mail.example',
      ordersCount: null,
      createdAt: null,
    },
    billing: { city: 'Portland', province: 'OR', country: 'United States' },
    shipping: { city: 'Portland', province: 'OR', country: 'United States' },
    riskSignals: [
      { code: 'high_value_new_customer', detail: 'First-time customer placed a USD 510.00 order.' },
      {
        code: 'payment_not_captured',
        detail: 'Order financial_status is "authorized" - payment has not been captured.',
      },
    ],
  },
};

const ADVISORY_FIXTURES: OrderOpsEvalFixture[] = [
  ESTABLISHED_AUTHORIZED,
  COUNTRY_MISMATCH_ONLY,
  HIGH_VALUE_NEW_ONLY,
  LOOKUP_REVEALS_HISTORY,
];

afterEach(async () => {
  for (const orgId of createdOrgIds.splice(0)) {
    await cleanupTestData(orgId).catch(() => {});
  }
});

// Deterministic pre-filter: an order with no pre-scan signals must never reach
// the model. Hermetic (early return before any DB or network), so it runs in
// normal CI without a real key.
describe('order-ops deterministic pre-filter', () => {
  it('skips model review when the pre-scan found no risk signals', async () => {
    const escalations: string[] = [];
    const order: OrderForReview = {
      id: '5000',
      name: '#5000',
      createdAt: '2026-07-21T08:00:00Z',
      financialStatus: 'paid',
      fulfillmentStatus: 'fulfilled',
      totalPrice: '39.00',
      currency: 'USD',
      customer: { id: '9000', email: 'normal@mail.example', ordersCount: 12, createdAt: '2024-01-01T00:00:00Z' },
      billing: { city: 'Boise', province: 'ID', country: 'United States' },
      shipping: { city: 'Boise', province: 'ID', country: 'United States' },
      riskSignals: [],
    };
    const ctx = await buildEvalContext('order-ops-eval-no-signal', order, escalations);

    const result = await runOrderOps(ctx);

    expect(result.flagged).toBe(false);
    expect(result.summary).toContain('No pre-scan risk signals');
    expect(result.actionsPerformed).toEqual([]);
    expect(escalations).toEqual([]);
  });
});

describe.sequential('order-ops fraud-review evals', () => {
  if (!hasRealKey) {
    it.skip('requires ANTHROPIC_API_KEY to be set to a real key', () => {});
    return;
  }

  beforeEach(() => {
    allowTestNetworkHosts('api.anthropic.com');
  });

  it(`${CLEAR_FRAUD.id} — ${CLEAR_FRAUD.description}`, async () => {
    const repeats = 3;
    let flagged = 0;
    let lastReason: string | null = null;
    for (let i = 0; i < repeats; i += 1) {
      const { result } = await runOrderOpsFixture(CLEAR_FRAUD);
      if (result.flagged) {
        flagged += 1;
        lastReason = result.flagReason;
      }
    }
    console.log(
      `[order-ops-eval] ${CLEAR_FRAUD.id}: flagged ${flagged}/${repeats} (reason e.g. ${JSON.stringify(lastReason)})`,
    );
    expect(flagged).toBeGreaterThanOrEqual(2);
  }, 240_000);

  for (const fixture of ADVISORY_FIXTURES) {
    it(`${fixture.id} — ${fixture.description} [advisory]`, async () => {
      const { result } = await runOrderOpsFixture(fixture);
      const matched = result.flagged === fixture.expectFlag;
      const toolTrace = result.actionsPerformed.map(a => ({
        tool: a.tool,
        status: a.status,
        result: a.result.slice(0, 80),
      }));
      console.log(
        `[order-ops-eval] ${fixture.id}: flagged=${result.flagged} expected=${fixture.expectFlag} `
        + `match=${matched} reason=${JSON.stringify(result.flagReason)} `
        + `tools=${JSON.stringify(toolTrace)}`,
      );
      // Advisory: record only. Judgment on borderline fraud patterns is not a gate.
      expect(result).toBeDefined();
    }, 240_000);
  }
});
