import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureProductEvent,
  initializeProductAnalytics,
  loggerWarn,
} = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
  initializeProductAnalytics: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@shopkeeper/analytics', () => ({
  captureProductEvent,
  initializeProductAnalytics,
  TOOL_CATEGORIES: ['action', 'communication', 'internal', 'read'],
  TOOL_NAMES: ['send_reply'],
  productEventInsertId: {
    agentActionCompleted: (actionId: string) => `agent_action_completed:${actionId}`,
    agentPlanGenerated: (planId: string) => `agent_plan_generated:${planId}`,
    integrationConnectionCompleted: vi.fn(),
    integrationConnectionFailed: vi.fn(),
    subscriptionStatusChanged: (eventId: string) => `subscription_status_changed:${eventId}`,
  },
}));

vi.mock('@shopkeeper/db', () => ({
  db: {
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/server/logger', () => ({
  default: {
    warn: loggerWarn,
  },
}));

const EVENT = {
  event: 'integration_connection_started',
  organizationId: '00000000-0000-4000-8000-000000000001',
  source: 'dashboard',
  platform: 'shopify',
} as const;

async function loadCapture() {
  const analyticsModule = await import('./product-analytics');
  return analyticsModule.captureDashboardProductEvent;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('captureDashboardProductEvent', () => {
  it('initializes the immediate sink once in the capturing bundle', async () => {
    const capture = await loadCapture();

    await capture(EVENT);
    await capture(EVENT);

    expect(initializeProductAnalytics).toHaveBeenCalledTimes(1);
    expect(initializeProductAnalytics).toHaveBeenCalledWith({
      delivery: 'immediate',
      logger: expect.objectContaining({ warn: loggerWarn }),
    });
    expect(captureProductEvent).toHaveBeenCalledTimes(2);
  });

  it('preserves the sink explicitly installed by tests', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const capture = await loadCapture();

    await capture(EVENT);

    expect(initializeProductAnalytics).not.toHaveBeenCalled();
    expect(captureProductEvent).toHaveBeenCalledWith(EVENT);
  });

  it('logs and isolates initialization failures from product capture', async () => {
    initializeProductAnalytics.mockImplementationOnce(() => {
      throw new TypeError('Invalid analytics configuration');
    });
    const capture = await loadCapture();

    await expect(capture(EVENT)).resolves.toBeUndefined();

    expect(loggerWarn).toHaveBeenCalledWith(
      { errorClass: 'TypeError' },
      '[ProductAnalytics] Dashboard initialization failed',
    );
    expect(captureProductEvent).toHaveBeenCalledWith(EVENT);
  });
});

describe('captureSubscriptionStatusChanged', () => {
  it('captures a committed status transition with the Stripe event insert ID', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { captureSubscriptionStatusChanged } = await import('./product-analytics');

    await captureSubscriptionStatusChanged({
      previousStatus: 'trialing',
      newStatus: 'active',
      plan: 'pro',
      organizationId: EVENT.organizationId,
      stripeEventId: 'evt_subscription_updated',
    });

    expect(captureProductEvent).toHaveBeenCalledWith({
      event: 'subscription_status_changed',
      organizationId: EVENT.organizationId,
      source: 'dashboard',
      previousStatus: 'trialing',
      newStatus: 'active',
      plan: 'pro',
      insertId: 'subscription_status_changed:evt_subscription_updated',
    });
  });

  it('does not capture a webhook that leaves status unchanged', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { captureSubscriptionStatusChanged } = await import('./product-analytics');

    await captureSubscriptionStatusChanged({
      previousStatus: 'active',
      newStatus: 'active',
      plan: 'pro',
      organizationId: EVENT.organizationId,
      stripeEventId: 'evt_no_change',
    });

    expect(captureProductEvent).not.toHaveBeenCalled();
  });
});

describe('agent value events', () => {
  it('captures a cached plan and persisted action without content fields', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const {
      captureAgentActionsCompleted,
      captureAgentPlanGenerated,
    } = await import('./product-analytics');

    await captureAgentPlanGenerated({
      cacheHit: true,
      channel: 'email',
      generationMs: 9,
      organizationId: EVENT.organizationId,
      planId: 'plan-1',
      stepCount: 3,
    });
    captureAgentActionsCompleted([{
      id: 'action-1',
      organizationId: EVENT.organizationId,
      tool: 'send_reply',
      category: 'communication',
      status: 'success',
    }]);

    expect(captureProductEvent).toHaveBeenNthCalledWith(1, {
      event: 'agent_plan_generated',
      organizationId: EVENT.organizationId,
      source: 'dashboard',
      channel: 'email',
      planSource: 'cached',
      stepCount: 3,
      generationMs: 9,
      cacheHit: true,
      insertId: 'agent_plan_generated:plan-1',
    });
    expect(captureProductEvent).toHaveBeenNthCalledWith(2, {
      event: 'agent_action_completed',
      organizationId: EVENT.organizationId,
      source: 'dashboard',
      toolName: 'send_reply',
      toolCategory: 'communication',
      outcome: 'succeeded',
      insertId: 'agent_action_completed:action-1',
    });
  });
});
