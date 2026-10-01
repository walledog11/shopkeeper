import { clerkClient } from '@clerk/nextjs/server';
import { del, list } from '@vercel/blob';
import {
  beginIntegrationDisconnect, claimIntegrationDisconnect, completeIntegrationDisconnect,
  completeWorkspaceDeletion, db, markIntegrationProviderCleaned,
  markWorkspaceClerkDeleted, markWorkspaceIntegrationsCleaned, markWorkspaceStripeCanceled,
  releaseIntegrationDisconnect,
} from '@shopkeeper/db';
import { ConflictError } from '@/lib/api/errors';
import { cleanupIntegrationProvider } from '@/app/api/integrations/_lib/provider-cleanup';
import { cancelWorkspaceSubscription } from '@/app/api/org/_lib/delete-workspace';

async function assertClaim(operationId: string, claimToken: string): Promise<void> {
  const renewed = await db.workspaceDeletion.updateMany({
    where: { id: operationId, status: 'processing', claimToken },
    data: { claimedAt: new Date() },
  });
  if (renewed.count !== 1) throw new ConflictError('Workspace deletion claim is no longer active');
}

async function cleanIntegrations(organizationId: string, assertActive: () => Promise<void>): Promise<boolean> {
  const integrations = await db.integration.findMany({
    where: { organizationId }, select: { id: true }, orderBy: { id: 'asc' }, take: 10,
  });
  for (const integration of integrations) {
    await assertActive();
    const started = await beginIntegrationDisconnect({ integrationId: integration.id, organizationId });
    if (!started || started.operation.status === 'completed') continue;
    const claimed = await claimIntegrationDisconnect(started.operation.id);
    if (!claimed) return false;
    try {
      if (!claimed.operation.providerCleanedAt) {
        const credentials = await db.integration.findFirstOrThrow({ where: { id: integration.id, organizationId } });
        await cleanupIntegrationProvider(credentials);
        if (!await markIntegrationProviderCleaned(claimed.operation.id, claimed.claimToken)) return false;
      }
      if (!await completeIntegrationDisconnect(claimed.operation.id, claimed.claimToken)) return false;
    } catch (error) {
      await releaseIntegrationDisconnect(claimed.operation.id, claimed.claimToken, error);
      throw error;
    }
  }
  return await db.integration.count({ where: { organizationId } }) === 0;
}

/** Runs bounded, idempotent external steps; the worker retries the durable record. */
export async function processWorkspaceDeletion(operationId: string, claimToken: string): Promise<boolean> {
  await assertClaim(operationId, claimToken);
  const operation = await db.workspaceDeletion.findUniqueOrThrow({ where: { id: operationId } });
  const assertActive = () => assertClaim(operationId, claimToken);

  // Billing stops before identity or local data can disappear.
  if (!operation.stripeCanceledAt) {
    await cancelWorkspaceSubscription({ id: operation.organizationId, stripeSubscriptionId: operation.stripeSubscriptionId });
    if (!await markWorkspaceStripeCanceled(operationId, claimToken)) return false;
  }
  if (!operation.integrationsCleanedAt) {
    // Preserve credentials and action records while in-flight work drains.
    const now = new Date();
    const [runningTasks, recentExecutions] = await Promise.all([
      db.agentTask.count({ where: {
        organizationId: operation.organizationId, status: 'running', leaseExpiresAt: { gt: now },
      } }),
      db.planExecution.count({ where: {
        organizationId: operation.organizationId, status: 'claimed',
        claimedAt: { gt: new Date(now.getTime() - 300_000) },
      } }),
    ]);
    if (runningTasks > 0 || recentExecutions > 0) return false;
    if (!await cleanIntegrations(operation.organizationId, assertActive)) return false;
    await assertActive();
    // Prefix listing also removes uploads that were never attached to a message.
    const blobs = await list({ prefix: `attachments/${operation.organizationId}/`, limit: 100 });
    if (blobs.blobs.length > 0) await del(blobs.blobs.map(blob => blob.url));
    if (blobs.hasMore) return false;
    if (!await markWorkspaceIntegrationsCleaned(operationId, claimToken)) return false;
  }
  if (!operation.clerkDeletedAt) {
    await assertActive();
    const clerk = await clerkClient();
    try {
      await clerk.organizations.deleteOrganization(operation.clerkOrgId);
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
    if (!await markWorkspaceClerkDeleted(operationId, claimToken)) return false;
  }
  await assertActive();
  return completeWorkspaceDeletion(operationId, claimToken);
}
