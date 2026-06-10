import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, ChannelType } from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { runEmailTokenHealthCheck } from './email-token-health.js';

describe('runEmailTokenHealthCheck', () => {
  let orgId: string | null = null;
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  });

  afterEach(async () => {
    global.fetch = realFetch;
    await cleanupTestData(orgId);
    orgId = null;
  });

  async function createGmailIntegration(tokenExpiresAt: Date) {
    const org = await createTestOrg();
    orgId = org.id;
    return db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        externalAccountId: 'merchant@gmail.com',
        accessToken: 'old-access',
        refreshToken: 'refresh-token',
        tokenExpiresAt,
        metadata: { provider: 'gmail' },
      },
    });
  }

  it('sets the epoch sentinel when the refresh token is dead (400)', async () => {
    const integration = await createGmailIntegration(new Date(Date.now() + 3_600_000));
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{"error":"invalid_grant"}', { status: 400 }),
    ) as unknown as typeof fetch;

    await runEmailTokenHealthCheck();

    const after = await db.integration.findUnique({ where: { id: integration.id } });
    expect(after?.tokenExpiresAt?.getTime()).toBe(0);
  });

  it('refreshes tokens and pushes expiry into the future on success', async () => {
    const integration = await createGmailIntegration(new Date(Date.now() + 3_600_000));
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'new-access', expires_in: 3600 }), { status: 200 }),
    ) as unknown as typeof fetch;

    await runEmailTokenHealthCheck();

    const after = await db.integration.findUnique({ where: { id: integration.id } });
    expect(after?.tokenExpiresAt?.getTime()).toBeGreaterThan(Date.now());
    expect(after?.accessToken).toBe('new-access');
  });

  it('leaves the token alone on a transient provider error (500)', async () => {
    const expiresAt = new Date(Date.now() + 3_600_000);
    const integration = await createGmailIntegration(expiresAt);
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 500 })) as unknown as typeof fetch;

    await runEmailTokenHealthCheck();

    const after = await db.integration.findUnique({ where: { id: integration.id } });
    expect(after?.tokenExpiresAt?.getTime()).toBe(expiresAt.getTime());
  });
});
