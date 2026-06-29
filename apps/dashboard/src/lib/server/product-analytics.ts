import {
  captureProductEvent,
  productEventInsertId,
  type IntegrationFailureCategory,
  type IntegrationPlatform,
} from '@shopkeeper/analytics';
import { db } from '@shopkeeper/db';
import logger from '@/lib/server/logger';

export async function captureIntegrationConnectionCompleted(args: {
  integrationId: string;
  organizationId: string;
  platform: IntegrationPlatform;
}): Promise<void> {
  await captureProductEvent({
    event: 'integration_connection_completed',
    organizationId: args.organizationId,
    source: 'dashboard',
    platform: args.platform,
    insertId: productEventInsertId.integrationConnectionCompleted(args.integrationId),
  });
}

export async function captureIntegrationConnectionFailed(args: {
  attemptId?: string;
  failureCategory: IntegrationFailureCategory;
  organizationId: string;
  platform: IntegrationPlatform;
}): Promise<void> {
  await captureProductEvent({
    event: 'integration_connection_failed',
    organizationId: args.organizationId,
    source: 'dashboard',
    platform: args.platform,
    failureCategory: args.failureCategory,
    ...(args.attemptId
      ? { insertId: productEventInsertId.integrationConnectionFailed(args.attemptId) }
      : {}),
  });
}

export async function captureOAuthIntegrationConnectionFailed(args: {
  attemptId?: string;
  clerkOrganizationId?: string;
  failureCategory: IntegrationFailureCategory;
  platform: IntegrationPlatform;
}): Promise<void> {
  if (!args.clerkOrganizationId) return;

  try {
    const organization = await db.organization.findUnique({
      where: { clerkOrgId: args.clerkOrganizationId },
      select: { id: true },
    });
    if (!organization) return;

    await captureIntegrationConnectionFailed({
      attemptId: args.attemptId,
      failureCategory: args.failureCategory,
      organizationId: organization.id,
      platform: args.platform,
    });
  } catch (error) {
    logger.warn(
      {
        errorClass: error instanceof Error ? error.name : 'UnknownError',
        platform: args.platform,
      },
      '[ProductAnalytics] OAuth failure context resolution failed',
    );
  }
}
