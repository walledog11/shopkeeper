import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginWorkspaceDeletion, claimWorkspaceDeletion, db, releaseWorkspaceDeletion,
} from '@shopkeeper/db';
import { cleanupTestData, createTestCustomer, createTestIntegration, createTestMessage, createTestOrg, createTestThread } from '@shopkeeper/db/test-helpers';
import { acceptCustomerAgentRequest, claimAgentTask, reserveAgentTaskModelCall } from '@shopkeeper/agent/task-ledger';

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), clerkDelete: vi.fn(), list: vi.fn(), del: vi.fn(), cleanup: vi.fn() }));
vi.mock('@/lib/billing/stripe', () => ({ default: { subscriptions: { cancel: mocks.cancel } } }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: async () => ({ organizations: { deleteOrganization: mocks.clerkDelete } }) }));
vi.mock('@vercel/blob', () => ({ list: mocks.list, del: mocks.del }));
vi.mock('@/app/api/integrations/_lib/provider-cleanup', () => ({ cleanupIntegrationProvider: mocks.cleanup }));
import { processWorkspaceDeletion } from './workspace-deletion';

let org: Awaited<ReturnType<typeof createTestOrg>>;
beforeEach(async () => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue({ blobs: [], hasMore: false });
  org = await createTestOrg();
  await db.organization.update({ where: { id: org.id }, data: { stripeSubscriptionId: 'sub_cleanup' } });
});
afterEach(async () => { await cleanupTestData(org?.id); });

describe('recoverable workspace cleanup', () => {
  it('cancels active work and waits for its lease before removing credentials', async () => {
    const customer = await createTestCustomer(org.id, 'drain@example.com');
    const thread = await createTestThread(org.id, customer.id, 'email');
    const message = await createTestMessage(thread.id, 'Please help');
    const { task } = await acceptCustomerAgentRequest({
      organizationId: org.id, threadId: thread.id, sourceMessageId: message.id, objective: 'Help',
      budget: { runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 120_000, spendNanoUsdLimit: BigInt(1_000_000_000) },
    });
    const active = (await claimAgentTask({ organizationId: org.id, taskId: task.id, expectedRevision: task.revision }))!;
    const integration = await createTestIntegration(org.id);
    const started = await beginWorkspaceDeletion(org.id);
    const deletion = (await claimWorkspaceDeletion(started!.operation.id))!;
    expect(await reserveAgentTaskModelCall({ organizationId: org.id, taskId: task.id,
      expectedRevision: task.revision, claimToken: active.claimToken })).toBe('cancelled');
    expect(await processWorkspaceDeletion(deletion.operation.id, deletion.claimToken)).toBe(false);
    expect(await db.integration.findUnique({ where: { id: integration.id } })).not.toBeNull();
    expect(mocks.clerkDelete).not.toHaveBeenCalled();
    await db.agentTask.update({ where: { id: task.id }, data: { leaseExpiresAt: new Date(0) } });
    expect(await processWorkspaceDeletion(deletion.operation.id, deletion.claimToken)).toBe(true);
  });

  it('retains billing and credentials on cancellation failure, then completes after retry', async () => {
    const integration = await createTestIntegration(org.id);
    const started = await beginWorkspaceDeletion(org.id);
    const first = (await claimWorkspaceDeletion(started!.operation.id))!;
    mocks.cancel.mockRejectedValueOnce(new Error('Stripe unavailable'));
    await expect(processWorkspaceDeletion(first.operation.id, first.claimToken)).rejects.toThrow('Stripe unavailable');
    expect(await db.integration.findUnique({ where: { id: integration.id } })).not.toBeNull();
    expect(mocks.clerkDelete).not.toHaveBeenCalled();
    await releaseWorkspaceDeletion(first.operation.id, first.claimToken, 'retry');
    const second = (await claimWorkspaceDeletion(first.operation.id))!;
    expect(await processWorkspaceDeletion(second.operation.id, second.claimToken)).toBe(true);
    expect(await db.organization.findUnique({ where: { id: org.id } })).toBeNull();
    expect((await db.workspaceDeletion.findUniqueOrThrow({ where: { id: first.operation.id } })).status).toBe('completed');
  });

  it('retries blob cleanup without canceling billing twice or deleting identity early', async () => {
    const started = await beginWorkspaceDeletion(org.id);
    const first = (await claimWorkspaceDeletion(started!.operation.id))!;
    mocks.list.mockResolvedValue({ blobs: [{ url: 'https://blob.example.test/attachment' }], hasMore: false });
    mocks.del.mockRejectedValueOnce(new Error('Blob unavailable'));
    await expect(processWorkspaceDeletion(first.operation.id, first.claimToken)).rejects.toThrow('Blob unavailable');
    expect(mocks.clerkDelete).not.toHaveBeenCalled();
    expect(await db.organization.findUnique({ where: { id: org.id } })).not.toBeNull();
    await releaseWorkspaceDeletion(first.operation.id, first.claimToken, 'retry');
    const second = (await claimWorkspaceDeletion(first.operation.id))!;
    expect(await processWorkspaceDeletion(second.operation.id, second.claimToken)).toBe(true);
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.del).toHaveBeenCalledTimes(2);
  });
});
