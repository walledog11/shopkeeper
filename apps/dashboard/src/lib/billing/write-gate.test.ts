import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import {
  assertBillingWriteAllowed,
  assertBillingWriteAllowedForOrgId,
} from './write-gate';

const orgIds: string[] = [];

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

describe('dashboard billing write gate', () => {
  it.each([null, 'trialing', 'active'])('allows %s billing', (stripeStatus) => {
    expect(() => assertBillingWriteAllowed({ stripeStatus })).not.toThrow();
  });

  it.each(['past_due', 'canceled'])('blocks %s billing', (stripeStatus) => {
    expect(() => assertBillingWriteAllowed({ stripeStatus })).toThrow(
      expect.objectContaining({ status: 402 }),
    );
  });

  it('loads and allows an active organization', async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    await db.organization.update({
      where: { id: org.id },
      data: { stripeStatus: 'active' },
    });

    await expect(assertBillingWriteAllowedForOrgId(org.id)).resolves.toBeUndefined();
  });

  it('returns not-found semantics for an unknown organization', async () => {
    await expect(assertBillingWriteAllowedForOrgId(randomUUID())).rejects.toMatchObject({
      status: 404,
      message: 'Organization not found',
    });
  });
});
