import { randomUUID } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import { InstagramAccountInUseError } from './instagram-connection';
import { persistSocialApiConnection } from './socialapi-connection';

const createdClerkOrgIds: string[] = [];

async function seedOrg() {
  const clerkOrgId = `org_test_${randomUUID()}`;
  createdClerkOrgIds.push(clerkOrgId);
  return db.organization.create({ data: { clerkOrgId, name: 'SocialAPI Connect Fixture' } });
}

function connectInput(organizationId: string, providerAccountId: string) {
  return {
    brandId: 'brand_1',
    connectedAt: new Date(),
    organizationId,
    providerAccountId,
    username: 'merchant',
  };
}

afterEach(async () => {
  for (const clerkOrgId of createdClerkOrgIds) {
    await db.organization.deleteMany({ where: { clerkOrgId } }).catch(() => undefined);
  }
  createdClerkOrgIds.length = 0;
});

describe('persistSocialApiConnection', () => {
  it('writes the column gateway ingress resolves and the transport the worker branches on', async () => {
    const org = await seedOrg();
    const providerAccountId = `acc_${randomUUID()}`;

    const { integration } = await persistSocialApiConnection(
      connectInput(org.id, providerAccountId),
    );

    const stored = await db.integration.findUniqueOrThrow({ where: { id: integration.id } });
    expect(stored.providerAccountId).toBe(providerAccountId);
    expect(stored.lifecycleStatus).toBe('active');
    // A SocialAPI row holds no Meta token: a leftover one would make it look
    // reachable from Meta-signed ingress.
    expect(stored.accessToken).toBeNull();
    expect(stored.metadata).toMatchObject({
      instagram: {
        authModel: 'socialapi',
        transport: 'socialapi',
        socialApiAccountId: providerAccountId,
        socialApiBrandId: 'brand_1',
        // Neither the exchange nor the account listing returns Instagram's own
        // account id, so the row records which id externalAccountId actually holds.
        externalAccountIdSource: 'provider',
      },
    });
    expect(stored.externalAccountId).toBe(providerAccountId);
  });

  it('reconnecting the same account updates the row rather than replacing it', async () => {
    const org = await seedOrg();
    const providerAccountId = `acc_${randomUUID()}`;
    const first = await persistSocialApiConnection(connectInput(org.id, providerAccountId));

    await db.integration.update({
      where: { id: first.integration.id },
      data: { lifecycleStatus: 'cleanup_failed' },
    });

    const second = await persistSocialApiConnection(connectInput(org.id, providerAccountId));

    expect(second.integration.id).toBe(first.integration.id);
    expect(second.replacedIntegrationId).toBeNull();
    // Reconnecting has to clear a lifecycle a failed disconnect left behind, or
    // the row is saved somewhere the integrations page can never show it.
    expect(second.integration.lifecycleStatus).toBe('active');
  });

  it('replaces a different account and releases its threads rather than stranding replies', async () => {
    const org = await seedOrg();
    const first = await persistSocialApiConnection(connectInput(org.id, `acc_${randomUUID()}`));
    const customer = await db.customer.create({
      data: {
        organization: { connect: { id: org.id } },
        platformId: `igsid_${randomUUID()}`,
      },
    });
    const thread = await db.thread.create({
      data: {
        organization: { connect: { id: org.id } },
        customer: { connect: { id: customer.id } },
        channelType: 'ig_dm',
        replyIntegration: { connect: { id: first.integration.id } },
      },
    });

    const second = await persistSocialApiConnection(connectInput(org.id, `acc_${randomUUID()}`));

    expect(second.replacedIntegrationId).toBe(first.integration.id);
    const orphaned = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(orphaned.replyIntegrationId).toBeNull();
    expect(orphaned.replyIntegrationUpdatedAt).not.toBeNull();
    const rows = await db.integration.findMany({
      where: { organizationId: org.id, platform: 'ig_dm' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(second.integration.id);
  });

  // Ingress resolves providerAccountId to exactly one workspace. Two workspaces
  // holding it is what turns a webhook into an ambiguous lookup, so connect has
  // to refuse it rather than let ingress discover it.
  it('refuses a provider account another workspace already holds', async () => {
    const owner = await seedOrg();
    const intruder = await seedOrg();
    const providerAccountId = `acc_${randomUUID()}`;
    await persistSocialApiConnection(connectInput(owner.id, providerAccountId));

    await expect(
      persistSocialApiConnection(connectInput(intruder.id, providerAccountId)),
    ).rejects.toBeInstanceOf(InstagramAccountInUseError);

    const rows = await db.integration.findMany({ where: { providerAccountId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.organizationId).toBe(owner.id);
  });
});
