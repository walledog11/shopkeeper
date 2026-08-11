import { afterEach, describe, expect, it } from 'vitest';
import {
  beginIntegrationDisconnect,
  claimIntegrationDisconnect,
  completeIntegrationDisconnect,
  db,
  failIntegrationDisconnect,
  listRecoverableIntegrationDisconnects,
  markIntegrationProviderCleaned,
  releaseIntegrationDisconnect,
} from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestIntegration,
  createTestOrg,
} from '@shopkeeper/db/test-helpers';

let organizationId: string | null = null;

afterEach(async () => {
  if (organizationId) {
    await db.integrationDisconnect.deleteMany({ where: { organizationId } });
    await cleanupTestData(organizationId);
  }
  organizationId = null;
});

describe('integration disconnect lifecycle', () => {
  it('atomically disables an integration, reassigns the default email, and records cleanup', async () => {
    const org = await createTestOrg();
    organizationId = org.id;
    const integration = await createTestIntegration(org.id, {
      externalAccountId: 'primary@example.test',
    });
    const replacement = await createTestIntegration(org.id, {
      emailProvider: 'gmail',
      externalAccountId: 'replacement@example.test',
    });
    await db.organization.update({
      where: { id: org.id },
      data: { defaultEmailIntegrationId: integration.id },
    });

    const result = await beginIntegrationDisconnect({
      integrationId: integration.id,
      organizationId: org.id,
    });

    expect(result).toMatchObject({
      deduplicated: false,
      operation: {
        integrationId: integration.id,
        organizationId: org.id,
        status: 'pending',
      },
    });
    await expect(db.integration.findUniqueOrThrow({ where: { id: integration.id } }))
      .resolves.toMatchObject({ lifecycleStatus: 'disconnecting' });
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ defaultEmailIntegrationId: replacement.id });
  });

  it('deduplicates concurrent starts and permits only one active claim', async () => {
    const org = await createTestOrg();
    organizationId = org.id;
    const integration = await createTestIntegration(org.id);

    const starts = await Promise.all([
      beginIntegrationDisconnect({ integrationId: integration.id, organizationId: org.id }),
      beginIntegrationDisconnect({ integrationId: integration.id, organizationId: org.id }),
    ]);
    const operationIds = new Set(starts.map(result => result?.operation.id));
    expect(operationIds.size).toBe(1);
    await expect(db.integrationDisconnect.count({
      where: { integrationId: integration.id },
    })).resolves.toBe(1);

    const operationId = starts[0]!.operation.id;
    const claims = await Promise.all([
      claimIntegrationDisconnect(operationId),
      claimIntegrationDisconnect(operationId),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('releases transient failures for retry and recovers stale claims', async () => {
    const org = await createTestOrg();
    organizationId = org.id;
    const integration = await createTestIntegration(org.id);
    const started = await beginIntegrationDisconnect({
      integrationId: integration.id,
      organizationId: org.id,
    });
    const operationId = started!.operation.id;
    const firstClaim = await claimIntegrationDisconnect(operationId);
    expect(firstClaim).not.toBeNull();

    await expect(releaseIntegrationDisconnect(
      operationId,
      firstClaim!.claimToken,
      new Error('provider unavailable'),
    )).resolves.toBe(true);
    const secondClaim = await claimIntegrationDisconnect(operationId);
    expect(secondClaim?.claimToken).not.toBe(firstClaim!.claimToken);

    const staleNow = new Date(Date.now() + 10 * 60 * 1000);
    await expect(listRecoverableIntegrationDisconnects({ now: staleNow }))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: operationId, status: 'processing' }),
      ]));
    const recovered = await claimIntegrationDisconnect(operationId, { now: staleNow });
    expect(recovered?.claimToken).not.toBe(secondClaim!.claimToken);
  });

  it('marks terminal cleanup failure and allows an explicit repeated disconnect to retry', async () => {
    const org = await createTestOrg();
    organizationId = org.id;
    const integration = await createTestIntegration(org.id);
    const started = await beginIntegrationDisconnect({
      integrationId: integration.id,
      organizationId: org.id,
    });
    const claim = await claimIntegrationDisconnect(started!.operation.id);

    await expect(failIntegrationDisconnect(
      started!.operation.id,
      claim!.claimToken,
      new Error('cleanup exhausted'),
    )).resolves.toBe(true);
    await expect(db.integration.findUniqueOrThrow({ where: { id: integration.id } }))
      .resolves.toMatchObject({ lifecycleStatus: 'cleanup_failed' });

    const retried = await beginIntegrationDisconnect({
      integrationId: integration.id,
      organizationId: org.id,
    });
    expect(retried).toMatchObject({
      deduplicated: true,
      operation: { status: 'pending', lastError: null },
    });
    await expect(db.integration.findUniqueOrThrow({ where: { id: integration.id } }))
      .resolves.toMatchObject({ lifecycleStatus: 'disconnecting' });
  });

  it('deletes local credentials and preserves a completed audit record', async () => {
    const org = await createTestOrg();
    organizationId = org.id;
    const integration = await createTestIntegration(org.id, {
      accessToken: 'sensitive-access-token',
      refreshToken: 'sensitive-refresh-token',
    });
    const started = await beginIntegrationDisconnect({
      integrationId: integration.id,
      organizationId: org.id,
    });
    const claim = await claimIntegrationDisconnect(started!.operation.id);

    await expect(markIntegrationProviderCleaned(
      started!.operation.id,
      claim!.claimToken,
    )).resolves.toBe(true);

    await expect(completeIntegrationDisconnect(
      started!.operation.id,
      claim!.claimToken,
    )).resolves.toBe(true);

    await expect(db.integration.findUnique({ where: { id: integration.id } }))
      .resolves.toBeNull();
    await expect(db.integrationDisconnect.findUniqueOrThrow({
      where: { id: started!.operation.id },
    })).resolves.toMatchObject({
      status: 'completed',
      claimToken: null,
      lastError: null,
      providerCleanedAt: expect.any(Date),
      localDataDeletedAt: expect.any(Date),
      completedAt: expect.any(Date),
    });
  });
});
