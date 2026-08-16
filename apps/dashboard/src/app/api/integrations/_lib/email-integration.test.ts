import { randomUUID } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
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
});
