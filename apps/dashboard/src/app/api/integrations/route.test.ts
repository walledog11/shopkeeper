import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { GET, POST } from './route';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_test',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('/api/integrations', () => {
  it('does not expose OAuth access or refresh tokens in GET responses', async () => {
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
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

  it('replaces the org email integration when saving forwarding', async () => {
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        externalAccountId: 'merchant@gmail.test',
        accessToken: 'gmail-access-token',
        refreshToken: 'gmail-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        metadata: { provider: 'gmail' },
      },
    });
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        externalAccountId: 'old-forwarding@example.com',
        metadata: { provider: 'postmark' },
      },
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
    expect(body.metadata).toMatchObject({ provider: 'postmark' });
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');

    const rows = await db.integration.findMany({
      where: { organizationId: org.id, platform: ChannelType.email },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].externalAccountId).toBe('support@example.com');
    expect(rows[0].accessToken).toBeNull();
    expect(rows[0].refreshToken).toBeNull();
    expect(rows[0].tokenExpiresAt).toBeNull();
    expect(rows[0].metadata).toMatchObject({ provider: 'postmark' });
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
