import { ACTIVATION_INBOUND_CHANNELS } from '@shopkeeper/shared/product-analytics';
import { db } from './client.js';
import { SenderType } from './prisma-enums.js';

export interface WorkspaceActivationSnapshot {
  organizationCreatedAt: Date;
  inboundMessageCount: number;
  hasShopifyIntegration: boolean;
  hasEmailIntegration: boolean;
}

export async function loadWorkspaceActivationSnapshot(
  organizationId: string,
): Promise<WorkspaceActivationSnapshot | null> {
  const [organization, integrations, inboundMessageCount] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { createdAt: true },
    }),
    db.integration.findMany({
      where: {
        organizationId,
        OR: [
          { platform: 'shopify', accessToken: { not: null } },
          { platform: 'email' },
        ],
      },
      select: { platform: true },
    }),
    db.message.count({
      where: {
        organizationId,
        senderType: SenderType.customer,
        thread: { channelType: { in: [...ACTIVATION_INBOUND_CHANNELS] } },
      },
    }),
  ]);

  if (!organization || inboundMessageCount === 0) return null;

  const connectedPlatforms = new Set(integrations.map(({ platform }) => platform));
  if (!connectedPlatforms.has('shopify') || !connectedPlatforms.has('email')) {
    return null;
  }

  return {
    organizationCreatedAt: organization.createdAt,
    inboundMessageCount,
    hasShopifyIntegration: true,
    hasEmailIntegration: true,
  };
}
