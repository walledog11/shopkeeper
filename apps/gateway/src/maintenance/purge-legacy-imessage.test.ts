import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg, createTestThread } from '@shopkeeper/db/test-helpers';
import { purgeLegacyImessageCustomerThreads } from './purge-legacy-imessage.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('purgeLegacyImessageCustomerThreads', () => {
  it('dry-run counts legacy imessage threads without mutating', async () => {
    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'legacy-imsg-customer', name: 'Legacy' },
    });
    await createTestThread(org.id, customer.id, ChannelType.imessage);
    const emailCustomer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'email-customer', name: 'Email' },
    });
    await createTestThread(org.id, emailCustomer.id, ChannelType.email);

    await expect(purgeLegacyImessageCustomerThreads({ dryRun: true })).resolves.toBe(1);

    const legacy = await db.thread.findMany({
      where: { organizationId: org.id, channelType: ChannelType.imessage, deletedAt: null },
    });
    expect(legacy).toHaveLength(1);
  });

  it('soft-deletes legacy imessage threads and leaves other channels', async () => {
    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'legacy-imsg-customer-2', name: 'Legacy' },
    });
    const legacyThread = await createTestThread(org.id, customer.id, ChannelType.imessage);
    const emailCustomer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'email-customer-2', name: 'Email' },
    });
    const emailThread = await createTestThread(org.id, emailCustomer.id, ChannelType.email);

    const purged = await purgeLegacyImessageCustomerThreads({ dryRun: false });
    expect(purged).toBe(1);

    const afterLegacy = await db.thread.findUnique({ where: { id: legacyThread.id } });
    expect(afterLegacy?.deletedAt).not.toBeNull();
    expect(afterLegacy?.status).toBe('closed');

    const afterEmail = await db.thread.findUnique({ where: { id: emailThread.id } });
    expect(afterEmail?.deletedAt).toBeNull();
  });
});
