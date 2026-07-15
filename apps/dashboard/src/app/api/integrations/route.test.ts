import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, EmailProvider, db } from '@shopkeeper/db';
import {
  NoopAnalyticsSink,
  RecordingAnalyticsSink,
  installProductAnalytics,
} from '@shopkeeper/analytics';
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { GET, POST } from './route';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let analyticsSink: RecordingAnalyticsSink;

beforeEach(async () => {
  org = await createTestOrg();
  analyticsSink = new RecordingAnalyticsSink();
  installProductAnalytics({ sink: analyticsSink, environment: 'test' });
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_test',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  installProductAnalytics({ sink: new NoopAnalyticsSink(), environment: 'test' });
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('/api/integrations', () => {
  it('does not expose OAuth access or refresh tokens in GET responses', async () => {
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        emailProvider: EmailProvider.gmail,
        externalAccountId: 'merchant@gmail.test',
        accessToken: 'secret-access-token',
        refreshToken: 'secret-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        metadata: { provider: 'gmail' },
      },
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0].metadata).toMatchObject({ provider: 'gmail' });
    expect(body[0]).not.toHaveProperty('accessToken');
    expect(body[0]).not.toHaveProperty('refreshToken');
  });

  it('reports per-channel last activity and weekly thread counts', async () => {
    const integration = await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        emailProvider: EmailProvider.postmark,
        externalAccountId: 'support@example.com',
      },
    });
    const customer = await createTestCustomer(org.id, 'customer@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        integrationId: integration.id,
        senderType: 'customer',
        contentText: 'Hello',
      },
    });
    await db.organization.update({
      where: { id: org.id },
      data: { defaultEmailIntegrationId: integration.id },
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0].lastActivity).toEqual(expect.any(String));
    expect(body[0].threadsThisWeek).toBe(1);
    expect(body[0].emailProvider).toBe('postmark');
    expect(body[0].isDefaultEmail).toBe(true);
  });

  it('updates forwarding in place without modifying Gmail', async () => {
    const gmail = await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        emailProvider: EmailProvider.gmail,
        externalAccountId: 'merchant@gmail.test',
        accessToken: 'gmail-access-token',
        refreshToken: 'gmail-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        metadata: { provider: 'gmail' },
      },
    });
    const forwarding = await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        emailProvider: EmailProvider.postmark,
        externalAccountId: 'old-forwarding@example.com',
        metadata: { provider: 'postmark' },
      },
    });
    await db.organization.update({
      where: { id: org.id },
      data: { defaultEmailIntegrationId: gmail.id },
    });

    const res = await POST(new Request('http://localhost/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'email', externalAccountId: 'Support@Example.com' }),
    }));

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.externalAccountId).toBe('support@example.com');
    expect(body.fromEmail).toBe('support@example.com');
    expect(body.emailProvider).toBe('postmark');
    expect(body.metadata).toMatchObject({ provider: 'postmark' });
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');

    const rows = await db.integration.findMany({
      where: { organizationId: org.id, platform: ChannelType.email },
    });
    expect(rows).toHaveLength(2);
    const savedGmail = rows.find((row) => row.emailProvider === EmailProvider.gmail)!;
    const savedForwarding = rows.find((row) => row.emailProvider === EmailProvider.postmark)!;
    expect(savedGmail.id).toBe(gmail.id);
    expect(savedGmail.accessToken).toBe('gmail-access-token');
    expect(savedForwarding.id).toBe(forwarding.id);
    expect(savedForwarding.externalAccountId).toBe('support@example.com');
    expect(savedForwarding.accessToken).toBeNull();
    expect(savedForwarding.refreshToken).toBeNull();
    expect(savedForwarding.tokenExpiresAt).toBeNull();
    expect(savedForwarding.metadata).toMatchObject({ provider: 'postmark' });
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ defaultEmailIntegrationId: gmail.id });
    expect(analyticsSink.events).toEqual([
      expect.objectContaining({
        event: 'integration_connection_completed',
        distinctId: org.id,
        properties: expect.objectContaining({
          organization_id: org.id,
          platform: 'email',
          '$insert_id': `integration_connection_completed:${savedForwarding.id}`,
        }),
      }),
    ]);
  });

  it('handles concurrent forwarding connects as one provider row', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => POST(new Request(
      'http://localhost/api/integrations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'email',
          externalAccountId: `support-${index}@example.com`,
        }),
      },
    ))));

    expect(responses.map((response) => response.status)).toEqual(Array(8).fill(201));
    const rows = await db.integration.findMany({
      where: {
        organizationId: org.id,
        platform: ChannelType.email,
        emailProvider: EmailProvider.postmark,
      },
    });
    expect(rows).toHaveLength(1);
    const organization = await db.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(organization.defaultEmailIntegrationId).toBe(rows[0].id);
  });

  it('rejects malformed JSON before creating an integration', async () => {
    const res = await POST(rawRequest('http://localhost/api/integrations', '{'));

    expect(res.status).toBe(400);
    await expect(db.integration.count({ where: { organizationId: org.id } })).resolves.toBe(0);
  });

  it('handles concurrent saves for the same integration key', async () => {
    const requests = Array.from({ length: 8 }, (_, index) => POST(new Request('http://localhost/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'shopify',
        externalAccountId: 'fixture-shop.myshopify.com',
        fromEmail: `Fixture Shop ${index}`,
      }),
    })));

    const responses = await Promise.all(requests);

    expect(responses.map((response) => response.status)).toEqual(Array(8).fill(201));
    const rows = await db.integration.findMany({
      where: {
        organizationId: org.id,
        platform: ChannelType.shopify,
        externalAccountId: 'fixture-shop.myshopify.com',
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].fromEmail).toMatch(/^Fixture Shop [0-7]$/);
  });
});

function rawRequest(url: string, body: string, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
