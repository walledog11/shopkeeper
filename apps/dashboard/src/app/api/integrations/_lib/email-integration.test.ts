import { randomUUID } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import { BadRequestError } from '@/lib/api/errors';
import { upsertEmailIntegration } from './email-integration';

const createdClerkOrgIds: string[] = [];

async function seedOrg() {
  const clerkOrgId = `org_test_${randomUUID()}`;
  createdClerkOrgIds.push(clerkOrgId);
  return db.organization.create({ data: { clerkOrgId, name: 'Reconnect Fixture' } });
}

afterEach(async () => {
  for (const clerkOrgId of createdClerkOrgIds) {
    await db.organization.deleteMany({ where: { clerkOrgId } }).catch(() => undefined);
  }
  createdClerkOrgIds.length = 0;
});

describe('upsertEmailIntegration', () => {
  // A failed disconnect leaves the row in `cleanup_failed`, which
  // getIntegrationsForOrg filters out. Reconnecting has to clear that or the
  // tokens are saved to a row the integrations page can never show.
  it('reactivates a row a failed disconnect left in cleanup_failed', async () => {
    const org = await seedOrg();
    const stuck = await db.integration.create({
      data: {
        organizationId: org.id,
        platform: 'email',
        emailProvider: 'gmail',
        externalAccountId: 'merchant@example.com',
        lifecycleStatus: 'cleanup_failed',
      },
    });

    await upsertEmailIntegration({
      organizationId: org.id,
      externalAccountId: 'merchant@example.com',
      provider: 'gmail',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
    });

    const reconnected = await db.integration.findUniqueOrThrow({ where: { id: stuck.id } });
    expect(reconnected.lifecycleStatus).toBe('active');
  });

  it('rejects Postmark connect when Gmail watch ingest is already active', async () => {
    const org = await seedOrg();
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: 'email',
        emailProvider: 'gmail',
        externalAccountId: 'merchant@example.com',
        lifecycleStatus: 'active',
        metadata: {
          provider: 'gmail',
          gmail: { inboundStatus: 'active' },
        },
      },
    });

    await expect(upsertEmailIntegration({
      organizationId: org.id,
      externalAccountId: 'support@example.com',
      fromEmail: 'support@example.com',
      provider: 'postmark',
    })).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects Gmail reconnect when Postmark forward is active and watch would ingest', async () => {
    const org = await seedOrg();
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: 'email',
        emailProvider: 'postmark',
        externalAccountId: 'support@example.com',
        lifecycleStatus: 'active',
        metadata: { provider: 'postmark' },
      },
    });
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: 'email',
        emailProvider: 'gmail',
        externalAccountId: 'merchant@example.com',
        lifecycleStatus: 'active',
        metadata: {
          provider: 'gmail',
          gmail: { inboundStatus: 'active' },
        },
      },
    });

    await expect(upsertEmailIntegration({
      organizationId: org.id,
      externalAccountId: 'merchant@example.com',
      provider: 'gmail',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
    })).rejects.toBeInstanceOf(BadRequestError);
  });

  it('strips legacy hybrid inboundMode on Gmail upsert', async () => {
    const org = await seedOrg();
    const gmail = await db.integration.create({
      data: {
        organizationId: org.id,
        platform: 'email',
        emailProvider: 'gmail',
        externalAccountId: 'merchant@example.com',
        metadata: { provider: 'gmail', inboundMode: 'hybrid' },
      },
    });

    await upsertEmailIntegration({
      organizationId: org.id,
      externalAccountId: 'merchant@example.com',
      provider: 'gmail',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
    });

    const updated = await db.integration.findUniqueOrThrow({ where: { id: gmail.id } });
    expect(updated.metadata).toMatchObject({ provider: 'gmail' });
    expect(updated.metadata).not.toHaveProperty('inboundMode');
  });
});
