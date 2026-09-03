import { db } from '@shopkeeper/db';
import { AmbiguousInstagramIntegrationError } from '@shopkeeper/integrations/instagram';

import { isRecord } from './typing.js';
export interface ActiveInstagramIntegration {
  id: string;
  organizationId: string;
  instagramAccountId: string;
  accessToken: string;
}

function isInstagramLoginMetadata(metadata: unknown): boolean {
  if (!isRecord(metadata) || !isRecord(metadata.instagram)) return false;
  return metadata.instagram.authModel === 'instagram_login';
}

function toActiveInstagramIntegration(
  integration: {
    accessToken: string | null;
    externalAccountId: string;
    id: string;
    metadata: unknown;
    organizationId: string;
  },
): ActiveInstagramIntegration | null {
  if (!integration.accessToken || !isInstagramLoginMetadata(integration.metadata)) return null;
  return {
    id: integration.id,
    organizationId: integration.organizationId,
    instagramAccountId: integration.externalAccountId,
    accessToken: integration.accessToken,
  };
}

const activeInstagramSelect = {
  accessToken: true,
  externalAccountId: true,
  id: true,
  metadata: true,
  organizationId: true,
} as const;

export async function resolveActiveInstagramIntegration(
  instagramAccountId: string,
): Promise<ActiveInstagramIntegration | null> {
  const integrations = await db.integration.findMany({
    where: {
      platform: 'ig_dm',
      externalAccountId: instagramAccountId,
      lifecycleStatus: 'active',
    },
    select: activeInstagramSelect,
    take: 2,
  });

  if (integrations.length > 1) {
    throw new AmbiguousInstagramIntegrationError(
      `Instagram account ${instagramAccountId} resolves to multiple active integrations`,
    );
  }

  return integrations[0] ? toActiveInstagramIntegration(integrations[0]) : null;
}

export async function loadActiveInstagramIntegration(input: {
  id: string;
  instagramAccountId: string;
  organizationId: string;
}): Promise<ActiveInstagramIntegration | null> {
  const integration = await db.integration.findFirst({
    where: {
      id: input.id,
      organizationId: input.organizationId,
      platform: 'ig_dm',
      externalAccountId: input.instagramAccountId,
      lifecycleStatus: 'active',
    },
    select: activeInstagramSelect,
  });

  return integration ? toActiveInstagramIntegration(integration) : null;
}
