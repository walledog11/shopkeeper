import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NoopAnalyticsSink,
  RecordingAnalyticsSink,
  installProductAnalytics,
} from '@shopkeeper/analytics';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';

const {
  mockAuth,
  mockRateLimit,
  mockRedisSet,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockRateLimit: vi.fn(),
  mockRedisSet: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  rateLimit: mockRateLimit,
  tooManyRequests: () => Response.json({ error: 'Too many requests' }, { status: 429 }),
}));

vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({ set: mockRedisSet }),
}));

import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let sink: RecordingAnalyticsSink;

function productEventRequest(body: unknown): Request {
  return new Request('http://localhost/api/product-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  org = await createTestOrg();
  sink = new RecordingAnalyticsSink();
  installProductAnalytics({ sink, environment: 'test' });
  mockAuth.mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId });
  mockRateLimit.mockResolvedValue({
    success: true,
    remaining: 59,
    reset: Math.floor(Date.now() / 1000) + 60,
  });
  mockRedisSet.mockResolvedValue('OK');
});

afterEach(async () => {
  installProductAnalytics({ sink: new NoopAnalyticsSink(), environment: 'test' });
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('POST /api/product-events', () => {
  it.each(['store', 'shopify', 'email', 'autonomy', 'plan'] as const)(
    'captures an organization-scoped %s onboarding step',
    async (step) => {
      const response = await POST(productEventRequest({
        event: 'onboarding_step_completed',
        step,
      }));

      expect(response.status).toBe(200);
      expect(sink.events).toEqual([
        {
          event: 'onboarding_step_completed',
          distinctId: org.id,
          properties: {
            organization_id: org.id,
            schema_version: 1,
            environment: 'test',
            source: 'dashboard',
            '$process_person_profile': false,
            step,
            '$insert_id': `onboarding_step_completed:${org.id}:${step}`,
          },
        },
      ]);
      expect(mockRedisSet).toHaveBeenCalledWith(
        `product-event:onboarding-step:${org.id}:${step}`,
        '1',
        { nx: true, ex: 2_592_000 },
      );
    },
  );

  it.each(['shopify', 'email', 'ig_dm', 'imessage'] as const)(
    'captures an allowed %s connection start',
    async (platform) => {
      const response = await POST(productEventRequest({
        event: 'integration_connection_started',
        platform,
      }));

      expect(response.status).toBe(200);
      expect(sink.events[0]).toMatchObject({
        event: 'integration_connection_started',
        distinctId: org.id,
        properties: {
          organization_id: org.id,
          platform,
        },
      });
      expect(mockRedisSet).not.toHaveBeenCalled();
    },
  );

  it('captures a plan dismissal only when the cached plan belongs to the organization', async () => {
    const customer = await createTestCustomer(org.id, 'plan-event@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const message = await createTestMessage(thread.id, 'Please help');
    const cachedPlan = buildAgentPlanCacheRecord({
      instruction: 'Help the customer',
      lastCustomerMessageId: message.id,
      settings: {},
      plan: {
        instruction: 'Help the customer',
        steps: [{
          id: 'send-1',
          tool: 'send_reply',
          label: 'Reply',
          description: 'Reply to the customer',
          category: 'communication',
          enabled: true,
        }],
        rawToolCalls: [{
          id: 'send-1',
          name: 'send_reply',
          input: { text: 'Hello' },
        }],
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cachedPlan as object, cachedPlanMessageId: message.id },
    });

    const response = await POST(productEventRequest({
      event: 'agent_plan_decided',
      decision: 'dismissed',
      planId: cachedPlan.planId,
    }));

    expect(response.status).toBe(200);
    expect(sink.events).toEqual([
      expect.objectContaining({
        event: 'agent_plan_decided',
        distinctId: org.id,
        properties: expect.objectContaining({
          decision: 'dismissed',
          channel: 'email',
          changed: false,
          '$insert_id': `agent_plan_decided:${cachedPlan.planId}`,
        }),
      }),
    ]);
  });

  it('requires authentication with an active organization', async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null });

    const response = await POST(productEventRequest({
      event: 'integration_connection_started',
      platform: 'shopify',
    }));

    expect(response.status).toBe(401);
    expect(sink.events).toEqual([]);
  });

  it.each([
    {
      event: 'onboarding_completed',
    },
    {
      event: 'onboarding_step_completed',
      step: 'store',
      organizationId: '00000000-0000-4000-8000-000000000000',
    },
    {
      event: 'integration_connection_started',
      platform: 'shopify',
      arbitrary: 'value',
    },
    {
      event: 'integration_connection_started',
      platform: 'telegram',
    },
    {
      event: 'onboarding_step_completed',
      step: 'intro',
    },
    {
      event: 'agent_plan_decided',
      decision: 'dismissed',
      planId: 'not-a-uuid',
    },
  ])('rejects unsupported, spoofed, or unknown input %#', async (body) => {
    const response = await POST(productEventRequest(body));

    expect(response.status).toBe(400);
    expect(sink.events).toEqual([]);
  });

  it('rejects malformed and oversized request bodies', async () => {
    const malformed = await POST(new Request('http://localhost/api/product-events', {
      method: 'POST',
      body: '{',
    }));
    const oversized = await POST(new Request('http://localhost/api/product-events', {
      method: 'POST',
      body: JSON.stringify({
        event: 'integration_connection_started',
        platform: 'shopify',
        padding: 'x'.repeat(1_024),
      }),
    }));

    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(sink.events).toEqual([]);
  });

  it('rate-limits before accepting an event', async () => {
    mockRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 60,
    });

    const response = await POST(productEventRequest({
      event: 'integration_connection_started',
      platform: 'shopify',
    }));

    expect(response.status).toBe(429);
    expect(sink.events).toEqual([]);
  });

  it('deduplicates onboarding steps through Redis', async () => {
    mockRedisSet.mockResolvedValue(null);

    const response = await POST(productEventRequest({
      event: 'onboarding_step_completed',
      step: 'email',
    }));

    expect(response.status).toBe(200);
    expect(sink.events).toEqual([]);
  });

  it('fails open when Redis is unavailable and relies on the insert ID', async () => {
    mockRedisSet.mockRejectedValue(new Error('redis unavailable'));

    const response = await POST(productEventRequest({
      event: 'onboarding_step_completed',
      step: 'email',
    }));

    expect(response.status).toBe(200);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0].properties['$insert_id']).toBe(
      `onboarding_step_completed:${org.id}:email`,
    );
  });

  it('does not turn analytics delivery failure into a product error', async () => {
    installProductAnalytics({
      environment: 'test',
      sink: {
        capture: async () => {
          throw new Error('PostHog unavailable');
        },
      },
      logger: { warn: vi.fn() },
    });

    const response = await POST(productEventRequest({
      event: 'integration_connection_started',
      platform: 'shopify',
    }));

    expect(response.status).toBe(200);
  });
});
