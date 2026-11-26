import { db } from '@shopkeeper/db';
import { SHOPIFY_ACCESS_SELECT, shopifyContextFor } from '@shopkeeper/agent/shopify/access';
import type { ShopifyContext } from '@shopkeeper/agent/shopify';

/** The workspace's Shopify context, or null when no store is connected. */
export async function loadShopifyContext(organizationId: string): Promise<ShopifyContext | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify', accessToken: { not: null } },
    select: SHOPIFY_ACCESS_SELECT,
  });
  return integration ? shopifyContextFor(integration) : null;
}
