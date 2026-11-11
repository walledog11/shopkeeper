import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './client.js';
import { cleanupTestData, createTestOrg } from './test-helpers.js';
import {
  assertBillingWriteAllowed,
  assertBillingWriteAllowedForOrgId,
} from './billing-write-gate.js';

const orgIds: string[] = [];

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

describe('billing write gate', () => {
  it.each([null, 'trialing', 'active'])('allows %s billing', (stripeStatus) => {
    expect(() => assertBillingWriteAllowed({ stripeStatus, shopifyBillingStatus: null })).not.toThrow();
  });

  it.each(['past_due', 'canceled'])('blocks %s billing', (stripeStatus) => {
    expect(() => assertBillingWriteAllowed({ stripeStatus, shopifyBillingStatus: null })).toThrow(
      expect.objectContaining({ status: 402 }),
    );
  });

  it.each([null, 'active'])('allows a %s Shopify plan', (shopifyBillingStatus) => {
    expect(() => assertBillingWriteAllowed({ stripeStatus: null, shopifyBillingStatus })).not.toThrow();
  });

  it.each(['frozen', 'inactive'])('blocks a %s Shopify plan', (shopifyBillingStatus) => {
    expect(() => assertBillingWriteAllowed({ stripeStatus: null, shopifyBillingStatus })).toThrow(
      expect.objectContaining({ status: 402 }),
    );
  });

  it('loads the Shopify plan status with the organization', async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    await db.organization.update({
      where: { id: org.id },
      data: { shopifyBillingStatus: 'frozen' },
    });

    await expect(assertBillingWriteAllowedForOrgId(org.id)).rejects.toMatchObject({ status: 402 });
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
