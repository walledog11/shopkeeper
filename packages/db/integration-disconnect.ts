import { randomUUID } from 'node:crypto';
import type { IntegrationDisconnect } from '@prisma/client';
import { db } from './index.js';
import {
  DEFAULT_LIFECYCLE_STALE_CLAIM_MS,
  lifecycleErrorDetail,
} from './lifecycle.js';

export interface BeginIntegrationDisconnectParams {
  integrationId: string;
  organizationId: string;
}

export interface IntegrationDisconnectClaim {
  claimToken: string;
  operation: IntegrationDisconnect;
}

export type BeginIntegrationDisconnectResult = {
  deduplicated: boolean;
  operation: IntegrationDisconnect;
} | null;

// Starts the local half of a disconnect atomically. From this commit onward the
// integration is unavailable for new work, its default-email reference has
// moved, and a durable cleanup record exists for a worker to claim.
export async function beginIntegrationDisconnect(
  params: BeginIntegrationDisconnectParams,
): Promise<BeginIntegrationDisconnectResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.integrationDisconnect.findFirst({
      where: {
        integrationId: params.integrationId,
        organizationId: params.organizationId,
      },
    });
    const integration = await tx.integration.findFirst({
      where: {
        id: params.integrationId,
        organizationId: params.organizationId,
      },
    });

    if (!integration) {
      return existing ? { deduplicated: true, operation: existing } : null;
    }

    if (existing) {
      if (existing.status === 'failed') {
        const operation = await tx.integrationDisconnect.update({
          where: { id: existing.id },
          data: {
            status: 'pending',
            claimToken: null,
            claimedAt: null,
            lastError: null,
          },
        });
        await tx.integration.update({
          where: { id: integration.id },
          data: { lifecycleStatus: 'disconnecting' },
        });
        return { deduplicated: true, operation };
      }

      if (integration.lifecycleStatus === 'active') {
        await tx.integration.update({
          where: { id: integration.id },
          data: { lifecycleStatus: 'disconnecting' },
        });
      }
      return { deduplicated: true, operation: existing };
    }

    const claimed = await tx.integration.updateMany({
      where: {
        id: integration.id,
        organizationId: params.organizationId,
        lifecycleStatus: 'active',
      },
      data: { lifecycleStatus: 'disconnecting' },
    });
    if (claimed.count !== 1) {
      const raced = await tx.integrationDisconnect.findUnique({
        where: { integrationId: integration.id },
      });
      return raced ? { deduplicated: true, operation: raced } : null;
    }

    if (integration.platform === 'email') {
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: params.organizationId },
        select: { defaultEmailIntegrationId: true },
      });
      if (organization.defaultEmailIntegrationId === integration.id) {
        const replacement = await tx.integration.findFirst({
          where: {
            organizationId: params.organizationId,
            platform: 'email',
            lifecycleStatus: 'active',
            id: { not: integration.id },
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        await tx.organization.update({
          where: { id: params.organizationId },
          data: { defaultEmailIntegrationId: replacement?.id ?? null },
        });
      }
    }

    const operation = await tx.integrationDisconnect.create({
      data: {
        integrationId: integration.id,
        organizationId: integration.organizationId,
        platform: integration.platform,
        externalAccountId: integration.externalAccountId,
      },
    });
    return { deduplicated: false, operation };
  });
}

export async function claimIntegrationDisconnect(
  operationId: string,
  options: {
    claimToken?: string;
    now?: Date;
    staleClaimMs?: number;
  } = {},
): Promise<IntegrationDisconnectClaim | null> {
  const now = options.now ?? new Date();
  const claimToken = options.claimToken ?? randomUUID();
  const staleBefore = new Date(
    now.getTime() - (options.staleClaimMs ?? DEFAULT_LIFECYCLE_STALE_CLAIM_MS),
  );
  const claimed = await db.integrationDisconnect.updateMany({
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

  const operation = await db.integrationDisconnect.findUniqueOrThrow({
    where: { id: operationId },
  });
  return { claimToken, operation };
}

export async function markIntegrationProviderCleaned(
  operationId: string,
  claimToken: string,
  cleanedAt: Date = new Date(),
): Promise<boolean> {
  const updated = await db.integrationDisconnect.updateMany({
    where: { id: operationId, status: 'processing', claimToken },
    data: { providerCleanedAt: cleanedAt },
  });
  return updated.count === 1;
}

export async function releaseIntegrationDisconnect(
  operationId: string,
  claimToken: string,
  error: unknown,
): Promise<boolean> {
  const updated = await db.integrationDisconnect.updateMany({
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

export async function failIntegrationDisconnect(
  operationId: string,
  claimToken: string,
  error: unknown,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const operation = await tx.integrationDisconnect.findFirst({
      where: { id: operationId, status: 'processing', claimToken },
    });
    if (!operation) return false;

    const failed = await tx.integrationDisconnect.updateMany({
      where: { id: operation.id, status: 'processing', claimToken },
      data: {
        status: 'failed',
        claimToken: null,
        claimedAt: null,
        lastError: lifecycleErrorDetail(error),
      },
    });
    if (failed.count !== 1) return false;

    await tx.integration.updateMany({
      where: {
        id: operation.integrationId,
        organizationId: operation.organizationId,
        lifecycleStatus: 'disconnecting',
      },
      data: { lifecycleStatus: 'cleanup_failed' },
    });
    return true;
  });
}

export async function completeIntegrationDisconnect(
  operationId: string,
  claimToken: string,
  completedAt: Date = new Date(),
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const operation = await tx.integrationDisconnect.findFirst({
      where: { id: operationId, status: 'processing', claimToken },
    });
    if (!operation) return false;
    if (!operation.providerCleanedAt) {
      throw new Error('Integration disconnect cannot complete before provider cleanup finishes.');
    }

    await tx.integration.deleteMany({
      where: {
        id: operation.integrationId,
        organizationId: operation.organizationId,
        lifecycleStatus: { in: ['disconnecting', 'cleanup_failed'] },
      },
    });
    const completed = await tx.integrationDisconnect.updateMany({
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

export async function listRecoverableIntegrationDisconnects(
  options: { limit?: number; now?: Date; staleClaimMs?: number } = {},
): Promise<IntegrationDisconnect[]> {
  const now = options.now ?? new Date();
  const staleBefore = new Date(
    now.getTime() - (options.staleClaimMs ?? DEFAULT_LIFECYCLE_STALE_CLAIM_MS),
  );
  return db.integrationDisconnect.findMany({
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
