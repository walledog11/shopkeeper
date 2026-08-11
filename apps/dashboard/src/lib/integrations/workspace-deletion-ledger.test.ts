import { afterEach, describe, expect, it } from 'vitest';
import {
  beginWorkspaceDeletion,
  claimWorkspaceDeletion,
  completeWorkspaceDeletion,
  db,
  failWorkspaceDeletion,
  markWorkspaceClerkDeleted,
  markWorkspaceIntegrationsCleaned,
  markWorkspaceStripeCanceled,
} from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

let organizationId: string | null = null;

afterEach(async () => {
  if (organizationId) {
    await cleanupTestData(organizationId);
    await db.workspaceDeletion.deleteMany({ where: { organizationId } });
  }
  organizationId = null;
});

describe('workspace deletion lifecycle', () => {
  it('atomically disables a workspace and snapshots external identifiers', async () => {
    const org = await createTestOrg();
    organizationId = org.id;
    await db.organization.update({
      where: { id: org.id },
      data: { stripeSubscriptionId: 'sub_workspace_delete' },
    });

    const result = await beginWorkspaceDeletion(org.id);

    expect(result).toMatchObject({
      deduplicated: false,
      operation: {
        organizationId: org.id,
        clerkOrgId: org.clerkOrgId,
        stripeSubscriptionId: 'sub_workspace_delete',
        status: 'pending',
      },
    });
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ lifecycleStatus: 'deleting' });
  });

  it('deduplicates concurrent starts and permits one active claim', async () => {
    const org = await createTestOrg();
    organizationId = org.id;

    const starts = await Promise.all([
      beginWorkspaceDeletion(org.id),
      beginWorkspaceDeletion(org.id),
    ]);
    expect(new Set(starts.map(result => result?.operation.id)).size).toBe(1);
    await expect(db.workspaceDeletion.count({ where: { organizationId: org.id } }))
      .resolves.toBe(1);

    const operationId = starts[0]!.operation.id;
    const claims = await Promise.all([
      claimWorkspaceDeletion(operationId),
      claimWorkspaceDeletion(operationId),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('does not remove local data before every external step is recorded', async () => {
    const org = await createTestOrg();
    organizationId = org.id;
    const started = await beginWorkspaceDeletion(org.id);
    const claim = await claimWorkspaceDeletion(started!.operation.id);

    await expect(completeWorkspaceDeletion(
      started!.operation.id,
      claim!.claimToken,
    )).rejects.toThrow('before all external steps finish');
    await expect(db.organization.findUnique({ where: { id: org.id } }))
      .resolves.not.toBeNull();
  });

  it('completes only after every idempotent step and preserves its audit record', async () => {
    const org = await createTestOrg();
    organizationId = org.id;
    const started = await beginWorkspaceDeletion(org.id);
    const claim = await claimWorkspaceDeletion(started!.operation.id);

    await expect(markWorkspaceIntegrationsCleaned(
      started!.operation.id,
      claim!.claimToken,
    )).resolves.toBe(true);
    await expect(markWorkspaceStripeCanceled(
      started!.operation.id,
      claim!.claimToken,
    )).resolves.toBe(true);
    await expect(markWorkspaceClerkDeleted(
      started!.operation.id,
      claim!.claimToken,
    )).resolves.toBe(true);
    await expect(completeWorkspaceDeletion(
      started!.operation.id,
      claim!.claimToken,
    )).resolves.toBe(true);

    await expect(db.organization.findUnique({ where: { id: org.id } }))
      .resolves.toBeNull();
    await expect(db.workspaceDeletion.findUniqueOrThrow({
      where: { id: started!.operation.id },
    })).resolves.toMatchObject({
      status: 'completed',
      integrationsCleanedAt: expect.any(Date),
      stripeCanceledAt: expect.any(Date),
      clerkDeletedAt: expect.any(Date),
      localDataDeletedAt: expect.any(Date),
      completedAt: expect.any(Date),
    });
  });

  it('marks terminal failure and reopens the same operation on explicit retry', async () => {
    const org = await createTestOrg();
    organizationId = org.id;
    const started = await beginWorkspaceDeletion(org.id);
    const claim = await claimWorkspaceDeletion(started!.operation.id);

    await expect(failWorkspaceDeletion(
      started!.operation.id,
      claim!.claimToken,
      new Error('Clerk unavailable'),
    )).resolves.toBe(true);
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ lifecycleStatus: 'deletion_failed' });

    const retried = await beginWorkspaceDeletion(org.id);
    expect(retried).toMatchObject({
      deduplicated: true,
      operation: { id: started!.operation.id, status: 'pending', lastError: null },
    });
    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ lifecycleStatus: 'deleting' });
  });
});
