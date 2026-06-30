import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureProductEvent, db, loggerWarn } = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
  db: {
    integration: {
      findMany: vi.fn(),
    },
    message: {
      count: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
  loggerWarn: vi.fn(),
}));

vi.mock('@shopkeeper/analytics', async (importActual) => ({
  ...(await importActual<typeof import('@shopkeeper/analytics')>()),
  captureProductEvent,
}));

vi.mock('@shopkeeper/db', async (importActual) => ({
  ...(await importActual<typeof import('@shopkeeper/db')>()),
  db,
}));

vi.mock('./logger.js', () => ({
  default: {
    warn: loggerWarn,
  },
}));

import {
  captureAgentActionsCompleted,
  captureAgentPlanGenerated,
  captureInboundMessageProcessed,
  captureOutboundReplySent,
  captureWorkspaceActivation,
  createProductAnalyticsShutdownResource,
} from './product-analytics.js';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const MESSAGE_ID = '00000000-0000-4000-8000-000000000002';

beforeEach(() => {
  vi.clearAllMocks();
  db.message.count.mockResolvedValue(1);
  db.organization.findUnique.mockResolvedValue({
    createdAt: new Date(Date.now() - 60_000),
  });
  db.integration.findMany.mockResolvedValue([
    { platform: 'shopify' },
    { platform: 'email' },
  ]);
});

describe('product analytics shutdown resource', () => {
  it('flushes the analytics sink when the resource closes', async () => {
    const shutdown = vi.fn(async () => {});
    const resource = createProductAnalyticsShutdownResource(shutdown);

    await resource.close();

    expect(resource.label).toBe('product-analytics');
    expect(shutdown).toHaveBeenCalledOnce();
  });
});

describe('gateway product event boundaries', () => {
  it('captures generated plans with safe aggregate properties', async () => {
    await captureAgentPlanGenerated({
      cacheHit: false,
      channel: 'email',
      generationMs: 123.9,
      organizationId: ORGANIZATION_ID,
      planId: '00000000-0000-4000-8000-000000000003',
      stepCount: 2,
    });

    expect(captureProductEvent).toHaveBeenCalledWith({
      event: 'agent_plan_generated',
      organizationId: ORGANIZATION_ID,
      source: 'gateway',
      channel: 'email',
      planSource: 'generated',
      stepCount: 2,
      generationMs: 123,
      cacheHit: false,
      insertId: 'agent_plan_generated:00000000-0000-4000-8000-000000000003',
    });
  });

  it('maps persisted action terminal states and ignores unknown tools', () => {
    captureAgentActionsCompleted([
      {
        id: '00000000-0000-4000-8000-000000000004',
        organizationId: ORGANIZATION_ID,
        tool: 'create_refund',
        category: 'action',
        status: 'policy_block',
      },
      {
        id: '00000000-0000-4000-8000-000000000005',
        organizationId: ORGANIZATION_ID,
        tool: 'future_tool',
        category: 'action',
        status: 'success',
      },
    ]);

    expect(captureProductEvent).toHaveBeenCalledTimes(1);
    expect(captureProductEvent).toHaveBeenCalledWith({
      event: 'agent_action_completed',
      organizationId: ORGANIZATION_ID,
      source: 'gateway',
      toolName: 'create_refund',
      toolCategory: 'action',
      outcome: 'blocked',
      insertId: 'agent_action_completed:00000000-0000-4000-8000-000000000004',
    });
  });

  it('captures a persisted real inbound message with a stable insert ID', async () => {
    await captureInboundMessageProcessed({
      channel: 'email',
      messageId: MESSAGE_ID,
      organizationId: ORGANIZATION_ID,
    });

    expect(captureProductEvent).toHaveBeenCalledWith({
      event: 'inbound_message_processed',
      organizationId: ORGANIZATION_ID,
      source: 'gateway',
      channel: 'email',
      isFirstForWorkspace: true,
      insertId: `inbound_message_processed:${MESSAGE_ID}`,
    });
  });

  it('captures successful agent delivery and activation after all prerequisites exist', async () => {
    await captureOutboundReplySent({
      channel: 'email',
      messageId: MESSAGE_ID,
      organizationId: ORGANIZATION_ID,
      replySource: 'agent_approved',
    });

    expect(captureProductEvent).toHaveBeenNthCalledWith(1, {
      event: 'outbound_reply_sent',
      organizationId: ORGANIZATION_ID,
      source: 'gateway',
      channel: 'email',
      replySource: 'agent_approved',
      insertId: `outbound_reply_sent:${MESSAGE_ID}`,
    });
    expect(captureProductEvent).toHaveBeenNthCalledWith(2, {
      event: 'workspace_activated',
      organizationId: ORGANIZATION_ID,
      source: 'gateway',
      secondsSinceWorkspaceCreated: expect.any(Number),
      withinSevenDays: true,
      insertId: `workspace_activated:${ORGANIZATION_ID}`,
    });
  });

  it('does not evaluate activation for a manual reply', async () => {
    await captureOutboundReplySent({
      channel: 'email',
      messageId: MESSAGE_ID,
      organizationId: ORGANIZATION_ID,
      replySource: 'manual',
    });

    expect(captureProductEvent).toHaveBeenCalledTimes(1);
    expect(db.organization.findUnique).not.toHaveBeenCalled();
  });

  it('does not activate without both required integrations', async () => {
    db.integration.findMany.mockResolvedValue([{ platform: 'shopify' }]);

    await captureWorkspaceActivation(ORGANIZATION_ID);

    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('isolates context lookup failures from the product workflow', async () => {
    db.message.count.mockRejectedValue(new Error('database unavailable'));

    await expect(captureInboundMessageProcessed({
      channel: 'email',
      messageId: MESSAGE_ID,
      organizationId: ORGANIZATION_ID,
    })).resolves.toBeUndefined();

    expect(loggerWarn).toHaveBeenCalledWith(
      {
        errorClass: 'Error',
        operation: 'inbound_message_processed',
        organizationId: ORGANIZATION_ID,
      },
      '[ProductAnalytics] Gateway event context resolution failed',
    );
  });
});
