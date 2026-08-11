import { randomUUID } from 'node:crypto';
import type { WorkspaceDeletion } from '@prisma/client';
import { db } from './index.js';
import {
  DEFAULT_LIFECYCLE_STALE_CLAIM_MS,
  lifecycleErrorDetail,
} from './lifecycle.js';

export interface WorkspaceDeletionClaim {
  claimToken: string;
  operation: WorkspaceDeletion;
}

export type BeginWorkspaceDeletionResult = {
  deduplicated: boolean;
  operation: WorkspaceDeletion;
} | null;

export async function beginWorkspaceDeletion(
  organizationId: string,
): Promise<BeginWorkspaceDeletionResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.workspaceDeletion.findUnique({
      where: { organizationId },
    });
    const organization = await tx.organization.findUnique({
      where: { id: organizationId },
      select: {
        clerkOrgId: true,
        lifecycleStatus: true,
        stripeSubscriptionId: true,
      },
    });

    if (!organization) {
      return existing ? { deduplicated: true, operation: existing } : null;
    }

    if (existing) {
      if (existing.status === 'failed') {
        const operation = await tx.workspaceDeletion.update({
          where: { id: existing.id },
          data: {
            status: 'pending',
            claimToken: null,
            claimedAt: null,
            lastError: null,
          },
        });
        await tx.organization.update({
          where: { id: organizationId },
          data: { lifecycleStatus: 'deleting' },
        });
        return { deduplicated: true, operation };
      }

      if (organization.lifecycleStatus === 'active') {
        await tx.organization.update({
          where: { id: organizationId },
          data: { lifecycleStatus: 'deleting' },
        });
      }
      return { deduplicated: true, operation: existing };
    }

    const claimed = await tx.organization.updateMany({
      where: { id: organizationId, lifecycleStatus: 'active' },
      data: { lifecycleStatus: 'deleting' },
    });
    if (claimed.count !== 1) {
      const raced = await tx.workspaceDeletion.findUnique({
        where: { organizationId },
      });
      return raced ? { deduplicated: true, operation: raced } : null;
    }

    const operation = await tx.workspaceDeletion.create({
      data: {
        organizationId,
        clerkOrgId: organization.clerkOrgId,
        stripeSubscriptionId: organization.stripeSubscriptionId,
      },
    });
    return { deduplicated: false, operation };
  });
}

export async function claimWorkspaceDeletion(
  operationId: string,
  options: {
    claimToken?: string;
    now?: Date;
    staleClaimMs?: number;
  } = {},
): Promise<WorkspaceDeletionClaim | null> {
  const now = options.now ?? new Date();
  const claimToken = options.claimToken ?? randomUUID();
  const staleBefore = new Date(
    now.getTime() - (options.staleClaimMs ?? DEFAULT_LIFECYCLE_STALE_CLAIM_MS),
  );
  const claimed = await db.workspaceDeletion.updateMany({
    where: {
      id: operationId,
      OR: [
        { status: 'pending' },
        { status: 'processing', claimedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: 'processing',
      claimToken,
      claimedAt: now,
      attempts: { increment: 1 },
      lastError: null,
    },
  });
  if (claimed.count !== 1) return null;

  const operation = await db.workspaceDeletion.findUniqueOrThrow({
    where: { id: operationId },
  });
  return { claimToken, operation };
}

async function markWorkspaceDeletionStep(
  operationId: string,
  claimToken: string,
  data: {
    integrationsCleanedAt?: Date;
    stripeCanceledAt?: Date;
    clerkDeletedAt?: Date;
  },
): Promise<boolean> {
  const updated = await db.workspaceDeletion.updateMany({
    where: { id: operationId, status: 'processing', claimToken },
    data,
  });
  return updated.count === 1;
}

export function markWorkspaceIntegrationsCleaned(
  operationId: string,
  claimToken: string,
  completedAt: Date = new Date(),
): Promise<boolean> {
  return markWorkspaceDeletionStep(operationId, claimToken, {
    integrationsCleanedAt: completedAt,
  });
}

export function markWorkspaceStripeCanceled(
  operationId: string,
  claimToken: string,
  completedAt: Date = new Date(),
): Promise<boolean> {
  return markWorkspaceDeletionStep(operationId, claimToken, {
    stripeCanceledAt: completedAt,
  });
}

export function markWorkspaceClerkDeleted(
  operationId: string,
  claimToken: string,
  completedAt: Date = new Date(),
): Promise<boolean> {
  return markWorkspaceDeletionStep(operationId, claimToken, {
    clerkDeletedAt: completedAt,
  });
}

export async function releaseWorkspaceDeletion(
  operationId: string,
  claimToken: string,
  error: unknown,
): Promise<boolean> {
  const updated = await db.workspaceDeletion.updateMany({
    where: { id: operationId, status: 'processing', claimToken },
    data: {
      status: 'pending',
      claimToken: null,
      claimedAt: null,
      lastError: lifecycleErrorDetail(error),
    },
  });
  return updated.count === 1;
}

export async function failWorkspaceDeletion(
  operationId: string,
  claimToken: string,
  error: unknown,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const operation = await tx.workspaceDeletion.findFirst({
      where: { id: operationId, status: 'processing', claimToken },
    });
    if (!operation) return false;

    const failed = await tx.workspaceDeletion.updateMany({
      where: { id: operation.id, status: 'processing', claimToken },
      data: {
        status: 'failed',
        claimToken: null,
        claimedAt: null,
        lastError: lifecycleErrorDetail(error),
      },
    });
    if (failed.count !== 1) return false;
    await tx.organization.updateMany({
      where: { id: operation.organizationId, lifecycleStatus: 'deleting' },
      data: { lifecycleStatus: 'deletion_failed' },
    });
    return true;
  });
}

export async function completeWorkspaceDeletion(
  operationId: string,
  claimToken: string,
  completedAt: Date = new Date(),
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const operation = await tx.workspaceDeletion.findFirst({
      where: { id: operationId, status: 'processing', claimToken },
    });
    if (!operation) return false;
    if (
      !operation.integrationsCleanedAt
      || !operation.stripeCanceledAt
      || !operation.clerkDeletedAt
    ) {
      throw new Error('Workspace deletion cannot complete before all external steps finish.');
    }

    await tx.organization.deleteMany({
      where: {
        id: operation.organizationId,
        lifecycleStatus: { in: ['deleting', 'deletion_failed'] },
      },
    });
    const completed = await tx.workspaceDeletion.updateMany({
      where: { id: operation.id, status: 'processing', claimToken },
      data: {
        status: 'completed',
        claimToken: null,
        claimedAt: null,
        localDataDeletedAt: completedAt,
        completedAt,
        lastError: null,
      },
    });
    return completed.count === 1;
  });
}

export async function listRecoverableWorkspaceDeletions(
  options: { limit?: number; now?: Date; staleClaimMs?: number } = {},
): Promise<WorkspaceDeletion[]> {
  const now = options.now ?? new Date();
  const staleBefore = new Date(
    now.getTime() - (options.staleClaimMs ?? DEFAULT_LIFECYCLE_STALE_CLAIM_MS),
  );
  return db.workspaceDeletion.findMany({
    where: {
      OR: [
        { status: 'pending' },
        { status: 'processing', claimedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: options.limit ?? 100,
  });
}
